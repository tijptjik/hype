// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import {
  fieldResearchImage,
  fieldResearchStack,
  featureOrigin,
} from '../schema/fieldResearch'
import { image } from '../schema/image'
import { imageAssetVersion, imageRevision } from '../schema/imageRevision'
import { layer } from '../schema/layer'
// DOMAIN
import { ResearchUploadMetadataSchema } from '#lib/fieldResearch/model.js'
import { requireFeatureType } from '#lib/features/intents.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import {
  readResearchSession,
  researchSessionGuard,
  touchResearchSession,
} from './fieldResearch'
import { prepareFeatureCreationContent } from './featureCreationRevision'
import { prepareNewLifecycleFeature } from './featureLifecycleIdentity'
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { readFeatureIntentPolicy } from './featureIntentPolicy'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

/** Convert one reviewed working stack into an unpublished Feature and immutable gallery.
 * @param db Request database. @param input Authorized project manager, current session revision and destination layer/type.
 * @returns Stable Feature identity; replay returns the original conversion receipt.
 * @remarks All image identities, gallery pins, Feature content and the conversion receipt commit
 * together. Capture rows and original coordinates are retained; no R2 object is moved or deleted.
 */
export async function convertResearchStack(
  db: Database,
  input: {
    sessionId: string
    stackId: string
    revision: number
    layerId: string
    featureType: string
    actorId: string
  },
): Promise<string> {
  const session = await readResearchSession(db, input.sessionId)
  const stack = await db
    .select()
    .from(fieldResearchStack)
    .where(
      and(
        eq(fieldResearchStack.id, input.stackId),
        eq(fieldResearchStack.sessionId, session.id),
      ),
    )
    .get()
  if (!stack) error(404, 'Stack not found')
  if (stack.featureId) return stack.featureId
  if (stack.longitude === null || stack.latitude === null)
    error(400, 'Place the stack on the map first')
  if (!(await hasFeatureLifecycleStorage(db)))
    error(409, 'Feature revision storage must be enabled before conversion')
  const destination = await db
    .select({
      id: layer.id,
      projectId: layer.projectId,
      organisationId: layer.organisationId,
    })
    .from(layer)
    .where(
      and(
        eq(layer.id, input.layerId),
        eq(layer.projectId, session.projectId),
        eq(layer.organisationId, session.organisationId),
        eq(layer.isArchived, false),
        sql`${layer.historicalSourceLayerId} IS NULL`,
      ),
    )
    .get()
  if (!destination) error(400, 'Choose an active layer in this session’s project')
  const policy = await readFeatureIntentPolicy(db, {
    type: 'layer',
    id: destination.id,
  })
  const type = requireFeatureType(policy.types, input.featureType)
  const rows = await db
    .select()
    .from(fieldResearchImage)
    .where(
      and(
        eq(fieldResearchImage.stackId, stack.id),
        eq(fieldResearchImage.sessionId, session.id),
        eq(fieldResearchImage.state, 'uploaded'),
      ),
    )
    .orderBy(fieldResearchImage.createdAt, fieldResearchImage.id)
  if (!rows.length) error(400, 'The stack has no uploaded images')
  const featureId = nanoid(12)
  const kind = type.kind ?? (type.id === 'business' ? 'place' : 'object')
  const title = stack.name?.trim() || `Field research ${featureId.slice(0, 6)}`
  const { content, checks } = await prepareFeatureCreationContent(db, {
    id: featureId,
    data: {
      id: featureId,
      organisationId: session.organisationId,
      projectId: session.projectId,
      layerId: destination.id,
      contributorId: input.actorId,
      geometry: { type: 'Point', coordinates: [stack.longitude, stack.latitude] },
      featureType: type.id,
      kind,
      associationRelation:
        type.relation ?? (kind === 'place' ? 'represents' : 'locatedAt'),
      isPublished: false,
      isPendingReview: false,
      isArchived: false,
      addressMeta: {},
      isDraft: false,
      isVisitable: true,
      isIntangible: false,
      visitableAsOf: new Date().toISOString().slice(0, 10),
    },
    i18n: { en: { title, baseName: title, titleGen: false, description: '' } },
    properties: [],
  })
  const guard = sql`(${researchSessionGuard(session.id, input.revision)})
    AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(policy.lineage)}) scope
      WHERE COALESCE((SELECT version FROM featureIntentPolicy WHERE scopeType=json_extract(scope.value,'$.scope.type') AND scopeId=json_extract(scope.value,'$.scope.id')),0)!=json_extract(scope.value,'$.version'))
    AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${stack.id} AND sessionId=${session.id} AND featureId IS NULL)
    AND EXISTS(SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId
      WHERE l.id=${destination.id} AND l.projectId=${session.projectId} AND l.organisationId=${session.organisationId}
      AND p.organisationId=${session.organisationId} AND l.isArchived=0 AND p.isArchived=0 AND o.isArchived=0 AND l.historicalSourceLayerId IS NULL)`
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: 'Field research stack converted',
  })
  const writes: BatchItem<'sqlite'>[] = [change.statement, ...checks]
  content.gallery = { order: [], entries: {}, sortMode: 'manual' }
  // Each asset is registered exactly once, with its uploaded bytes and original capture metadata.
  for (const row of rows) {
    const metadata = ResearchUploadMetadataSchema.parse(JSON.parse(row.metadata))
    const assetId = crypto.randomUUID(),
      revisionId = crypto.randomUUID()
    const imageMetadata = {
      originalFilename: metadata.originalFilename,
      originalExtension: metadata.originalFilename.split('.').pop() ?? null,
      originalWidth: metadata.originalWidth,
      originalHeight: metadata.originalHeight,
      cameraModel: metadata.cameraModel,
      capturedAt: metadata.capturedAt,
      credit: metadata.credit,
      latitude: metadata.coordinates ? String(metadata.coordinates[1]) : null,
      longitude: metadata.coordinates ? String(metadata.coordinates[0]) : null,
      uploadedAt: row.createdAt,
      modifiedAt: row.createdAt,
      contentHash: row.contentHash,
      rotation: 0,
    }
    writes.push(
      db.insert(image).values({
        id: row.id,
        contributorId: session.createdBy,
        env: row.env,
        publicId: row.storageKey,
        contentHash: row.contentHash,
        cdn: 'cloudflareR2',
        createdAt: row.createdAt,
        modifiedAt: row.createdAt,
      }),
      db.insert(imageAssetVersion).values({
        id: assetId,
        imageId: row.id,
        storageNamespace: row.env,
        storageKey: row.storageKey,
        contentHash: row.contentHash,
        mediaType: row.mediaType,
        byteSize: row.byteSize,
        changeSetId: change.id,
      }),
      db.insert(imageRevision).values({
        id: revisionId,
        imageId: row.id,
        assetVersionId: assetId,
        changeSetId: change.id,
        metadata: imageMetadata,
      }),
    )
    content.gallery.order.push(row.id)
    content.gallery.entries[row.id] = {
      imageRevisionId: revisionId,
      intent: 'undefined',
      isPublished: false,
      caption: {},
      alt: {},
    }
  }
  const plan = await prepareNewLifecycleFeature(db, {
    featureId,
    actorId: input.actorId,
    contributorId: input.actorId,
    guard,
    content: FeatureRevisionContentSchema.parse(content),
    scope: {
      organisationId: session.organisationId,
      projectId: session.projectId,
      layerId: destination.id,
    },
  })
  const committed = await executeRevisionBatch(db, guard, [
    ...writes,
    ...plan.statements,
    db.insert(featureOrigin).values({
      featureId,
      origin: 'field_research',
      originId: session.id,
      recordedAt: new Date().toISOString(),
      recordedBy: input.actorId,
    }),
    db
      .update(fieldResearchStack)
      .set({ featureId })
      .where(eq(fieldResearchStack.id, stack.id)),
    touchResearchSession(db, session.id),
  ])
  if (!committed)
    error(409, 'The session changed. Refresh and review the stack before converting.')
  return featureId
}
