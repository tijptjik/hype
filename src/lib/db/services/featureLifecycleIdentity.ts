// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature, featureProperty, featurePropertyI18n } from '../schema/feature'
import { featureImage } from '../schema/image'
import { featureLocation } from '../schema/location'
import { featureLocationMembership } from '../schema/locationRelationships'
import {
  acceptedFeatureRevision,
  lifecycleFeature,
  lifecycleWriteScope,
} from '../schema/featureLifecycle.target'
import {
  featureIdentityOperation,
  featureIdentityOperationMember,
} from '../schema/featureRevision'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import { prepareFeatureEdit, readCurrentFeatureRevision } from './featureLifecycle'
import {
  prepareFeatureEditorialProjection,
  featureContentProjectionMatches,
} from './featureRevisionProjection'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { FeatureLifecycleState, FeatureEditCommand } from './featureLifecycle'

// TABLE OF CONTENTS
// 1. Atomic new accepted identities
// 2. Direct staff split and merge

/** Prepare a complete new unpublished identity without reserving a row beforehand.
 * @param db Request database. @param input Authorized scope, complete content and attribution.
 * @returns New identity/revision and statements for a single acceptance transaction.
 * @remarks Callers must fence source records and authorize all copied references in the enclosing batch.
 */
export function prepareNewLifecycleFeature(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    contributorId?: string
    content: FeatureRevisionContent
    scope: Pick<FeatureLifecycleState, 'organisationId' | 'projectId' | 'layerId'>
  },
): { featureId: string; revisionId: string; statements: BatchItem<'sqlite'>[] } {
  const content = FeatureRevisionContentSchema.parse(input.content)
  // Associations and membership bindings belong to the new identity, not its predecessor.
  if (content.placement.location) {
    content.placement.location.associationVersion = crypto.randomUUID()
    for (const member of content.placement.location.memberships)
      member.bindingVersion = crypto.randomUUID()
  }
  const empty = structuredClone(content)
  empty.translations = {}
  empty.properties = {}
  empty.gallery = { order: [], entries: {} }
  empty.placement.location = null
  empty.detachedBrands = null
  const scope = {
    organisationId: input.scope.organisationId,
    projectId: input.scope.projectId,
    layerId: input.scope.layerId,
  }
  const createdAt = new Date().toISOString(),
    revisionId = crypto.randomUUID(),
    token = crypto.randomUUID()
  const record = {
    id: input.featureId,
    ...scope,
    contributorId: input.contributorId ?? input.publisherUserId ?? null,
    createdAt,
    modifiedAt: createdAt,
    isPublished: false,
    localIsPublished: false,
    isArchived: false,
    localIsArchived: null,
    isDraft: false,
    localLocationBrands: null,
    geometry: content.placement.geometry,
    addressMeta: content.placement.addressMeta,
    featureType: content.profile.featureType ?? null,
    nameTemplate: content.profile.nameTemplate
      ? { rule: content.profile.nameTemplate.rule }
      : null,
    kind: content.profile.kind ?? null,
    targetContext: content.profile.targetContext ?? null,
    associationRelation: content.profile.associationRelation ?? null,
    isIntangible: content.profile.isIntangible,
    isVisitable: content.profile.visitability.isVisitable,
    visitableAsOf: content.profile.visitability.asOf,
  }
  const source = {
    snapshot: {
      record,
      translations: [],
      properties: [],
      propertyTranslations: [],
      location: [],
      locationMemberships: [],
      galleryLinks: [],
      images: [],
      fieldDefinitions: [],
      fieldTranslations: [],
      fieldOptions: [],
      fieldOptionTranslations: [],
    },
    unchanged: sql`1`,
  }
  const projection = prepareFeatureEditorialProjection(db, {
    featureId: input.featureId,
    source,
    previous: empty,
    content,
    gallery: { actorId: input.actorId, attachmentGuard: input.guard },
    identity: { actorId: input.actorId },
  })
  const change = prepareRevisionChangeSet(db, input)
  const state = {
    ...scope,
    isPublished: false,
    isArchived: false,
    localIsPublished: false,
  }
  return {
    featureId: input.featureId,
    revisionId,
    statements: [
      db.insert(feature).values(record as typeof feature.$inferInsert),
      db.insert(lifecycleWriteScope).values({ featureId: input.featureId, token }),
      ...projection.statements,
      prepareRevisionCheck(db, projection.verify),
      change.statement,
      db.insert(acceptedFeatureRevision).values({
        id: revisionId,
        featureId: input.featureId,
        changeSetId: change.id,
        content: JSON.stringify(content),
        recordState: JSON.stringify(state),
        sequence: 0,
      }),
      db
        .update(lifecycleFeature)
        .set({ currentRevisionId: revisionId })
        .where(eq(lifecycleFeature.id, input.featureId)),
      ...(projection.afterPublication ?? []),
      prepareRevisionCheck(
        db,
        featureContentProjectionMatches(input.featureId, content),
      ),
      db
        .delete(lifecycleWriteScope)
        .where(eq(lifecycleWriteScope.featureId, input.featureId)),
    ],
  }
}

/** Prepare source retirement while removing active subscriptions after its final immutable snapshot.
 * @param db Request database. @param input Exact authorized source.
 * @returns Prepared retirement, or null for stale input.
 * @remarks Historical tasks and visits remain attached; Location refreshes must not mutate a retired source.
 */
async function prepareRetirement(
  db: Database,
  input: FeatureEditCommand,
): ReturnType<typeof prepareFeatureEdit> {
  const prepared = await prepareFeatureEdit(db, {
    ...input,
    state: { isArchived: true, isPublished: false },
    derive: content => content,
  })
  if (!prepared) return null
  // Keep the write scope open while clearing mutable subscriptions; the snapshot retains all source content.
  prepared.statements.splice(
    -2,
    0,
    db
      .update(feature)
      .set({
        localLocationBrands: sql`json_object('brands',json('[]'),'actorId',${input.actorId},
      'revision',${crypto.randomUUID()},'sourceAssociationRevision',(SELECT version FROM featureLocation WHERE featureId=${input.featureId}))`,
      })
      .where(eq(feature.id, input.featureId)),
    db
      .delete(featureLocationMembership)
      .where(eq(featureLocationMembership.featureId, input.featureId)),
    db.delete(featureLocation).where(eq(featureLocation.featureId, input.featureId)),
    db
      .update(feature)
      .set({ localLocationBrands: null })
      .where(eq(feature.id, input.featureId)),
    db
      .delete(featurePropertyI18n)
      .where(eq(featurePropertyI18n.featureId, input.featureId)),
    db.delete(featureProperty).where(eq(featureProperty.featureId, input.featureId)),
    db.delete(featureImage).where(eq(featureImage.featureId, input.featureId)),
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${input.featureId})
      AND NOT EXISTS(SELECT 1 FROM featureProperty WHERE featureId=${input.featureId})
      AND NOT EXISTS(SELECT 1 FROM featureImage WHERE featureId=${input.featureId})`,
    ),
  )
  return prepared
}

/** Split an inspected Feature into two new unpublished records in one transaction.
 * @param db Request database. @param input Source token, two names and optional chosen redirect index.
 * @returns Operation and successor IDs, or null if the source changed.
 * @remarks Preparation writes nothing. Historical tasks stay attached to the archived source.
 */
export async function splitLifecycleFeature(
  db: Database,
  input: Omit<FeatureEditCommand, 'derive' | 'state'> & {
    titles: readonly [string, string]
    locale: string
    redirectIndex: 0 | 1 | null
  },
): Promise<{ operationId: string; featureIds: [string, string] } | null> {
  if (input.titles.some(title => !title.trim()))
    throw new Error('Both successor names are required')
  const current = await readCurrentFeatureRevision(db, input)
  if (
    !current ||
    current.revisionId !== input.expectedRevisionId ||
    current.version !== input.expectedVersion
  )
    return null
  if (!Object.hasOwn(current.content.translations, input.locale))
    throw new Error('Choose an existing title language')
  const retired = await prepareRetirement(db, {
    ...input,
    state: { isArchived: true, isPublished: false },
    derive: c => c,
  })
  if (!retired) return null
  const ids: [string, string] = [crypto.randomUUID(), crypto.randomUUID()]
  const children = [] as ReturnType<typeof prepareNewLifecycleFeature>[]
  for (const [index, featureId] of ids.entries()) {
    const content = structuredClone(current.content)
    content.translations[input.locale].title = {
      value: input.titles[index].trim(),
      generated: false,
    }
    if (content.placement.location)
      content.placement.location.acceptancePolicy = {
        ...content.placement.location.acceptancePolicy,
        nameMode: 'independent',
      }
    const errors = await input.validate(current.content, content)
    if (errors.length) throw new Error(errors.join('; '))
    children.push(
      prepareNewLifecycleFeature(db, {
        ...input,
        featureId,
        content,
        scope: current.state,
      }),
    )
  }
  const change = prepareRevisionChangeSet(db, input),
    operationId = crypto.randomUUID()
  // Source retirement, complete children and exact lineage commit together; failed copies leave no reservations.
  const statements: BatchItem<'sqlite'>[] = [
    ...children.flatMap(child => child.statements),
    ...retired.statements,
    change.statement,
    db.insert(featureIdentityOperation).values({
      id: operationId,
      kind: 'split',
      changeSetId: change.id,
      dispositions: {
        redirectFeatureId:
          input.redirectIndex === null ? null : ids[input.redirectIndex],
      },
    }),
    db.insert(featureIdentityOperationMember).values({
      operationId,
      role: 'input',
      featureId: input.featureId,
      revisionId: current.revisionId,
    }),
    ...children.map(child =>
      db.insert(featureIdentityOperationMember).values({
        operationId,
        role: 'output',
        featureId: child.featureId,
        revisionId: child.revisionId,
      }),
    ),
  ]
  return (await executeRevisionBatch(db, retired.guard, statements))
    ? { operationId, featureIds: ids }
    : null
}

/** Merge two inspected Features, retaining the primary identity and its visibility.
 * @param db Request database. @param input Authorized primary edit and separately authorized secondary token.
 * @returns Operation receipt, or null when either inspected record changed.
 * @remarks Selected fields/photos are supplied by the ordinary merge editor; both redirects use operation dispositions.
 */
export async function mergeLifecycleFeatures(
  db: Database,
  input: FeatureEditCommand & {
    completion?: (revisionId: string) => BatchItem<'sqlite'>[]
    secondary: {
      featureId: string
      expectedRevisionId: string
      expectedVersion: number
      guard: RevisionCommand['guard']
    }
  },
): Promise<string | null> {
  if (input.featureId === input.secondary.featureId)
    throw new Error('Choose a different Feature')
  const primary = await prepareFeatureEdit(db, {
    ...input,
    state: undefined,
    identity: { actorId: input.actorId },
  })
  const secondary = await prepareRetirement(db, {
    ...input,
    ...input.secondary,
    state: { isPublished: false, isArchived: true },
    derive: c => c,
  })
  if (!primary || !secondary) return null
  const change = prepareRevisionChangeSet(db, input),
    operationId = crypto.randomUUID()
  const statements: BatchItem<'sqlite'>[] = [
    // Check both sources before any writes without combining their D1 parameter budgets.
    prepareRevisionCheck(db, secondary.guard),
    ...primary.statements,
    ...secondary.statements,
    change.statement,
    db.insert(featureIdentityOperation).values({
      id: operationId,
      kind: 'merge',
      changeSetId: change.id,
      dispositions: { redirectFeatureId: input.featureId },
    }),
    db.insert(featureIdentityOperationMember).values({
      operationId,
      role: 'input',
      featureId: input.featureId,
      revisionId: input.expectedRevisionId,
    }),
    db.insert(featureIdentityOperationMember).values({
      operationId,
      role: 'input',
      featureId: input.secondary.featureId,
      revisionId: input.secondary.expectedRevisionId,
    }),
    db.insert(featureIdentityOperationMember).values({
      operationId,
      role: 'output',
      featureId: input.featureId,
      revisionId: primary.revisionId,
    }),
    ...(input.completion?.(primary.revisionId) ?? []),
  ]
  return (await executeRevisionBatch(db, primary.guard, statements))
    ? operationId
    : null
}
