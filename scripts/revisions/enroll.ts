// RUNTIME
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { mediaCacheKey } from './cache-media'
import { scopedMediaRows, validateMediaScope } from './media-scope'
import {
  verifyPublishedSubmission,
  type PublishedSubmission,
} from './production/published-submissions'
import { retainedMetadata, verifiedRetainedPin } from './retained-media'
import { registerImageRevisionBaseline } from '../../src/lib/db/services/imageRevisionBaseline'
import { readFeatureRevisionSource } from '../../src/lib/db/services/featureRevisionSource'
import {
  buildFeatureRevisionBaselineContent,
  parseFeatureRevisionSource,
} from '../../src/lib/db/services/featureRevisionContent'
import {
  initializeFeatureRevision,
  prepareFeatureRevisionProposal,
  prepareRevisionChangeSet,
} from '../../src/lib/db/services/featureRevision'
import { executeRevisionBatch } from '../../src/lib/db/services/revisionBatch'
import { featureInitialRevision } from '../../src/lib/db/schema/featureInitialRevision'
import { featureImageUploadRevision } from '../../src/lib/db/schema/featureImageUploadRevision'
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../../src/lib/db/schema/featureRevision'
// TYPES
import type { LegacyMediaOptions } from './media-scope'
import type { MediaEvidence } from './cache-media'
import type { FeatureRevisionContent } from '../../src/lib/revisions/featureContent'

type Domain = ReturnType<typeof openSqliteDomain>
type Pin = { imageRevisionId: string; assetVersionId: string }
type PendingTask = {
  id: string
  type: string
  contributorId: string | null
  isDraft: number
}
const actorId = 'system:feature-revision-enrollment'
const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'undefined',
  'research',
]

/** Retains an existing submission state with explicit migration attribution.
 * @param domain Offline connection. @param featureId Owning Feature. @param proposal Newly enrolled proposal.
 * @returns Nothing after the guarded status transition; never impersonates a fresh contributor action.
 */
async function retainSubmission(
  domain: Domain,
  featureId: string,
  proposal: { proposalId: string; candidateRevisionId: string },
): Promise<void> {
  const change = prepareRevisionChangeSet(domain.db, {
    actorId,
    origin: 'migration',
    reason: 'Retained legacy submitted task status',
  })
  if (
    !(await executeRevisionBatch(
      domain.db,
      sql`EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${proposal.proposalId}
    AND featureId=${featureId} AND candidateRevisionId=${proposal.candidateRevisionId} AND status='draft')`,
      [
        change.statement,
        domain.db
          .update(featureRevisionProposal)
          .set({ status: 'submitted' })
          .where(sql`id=${proposal.proposalId}`),
        domain.db.insert(featureRevisionReview).values({
          id: crypto.randomUUID(),
          featureId,
          proposalId: proposal.proposalId,
          candidateRevisionId: proposal.candidateRevisionId,
          action: 'submitted',
          changeSetId: change.id,
        }),
      ],
    ))
  )
    throw new Error('Retained submission changed')
}

/** Captures mutable content and workflow projections, excluding additive revision storage.
 * @param domain Offline connection. @returns Deterministic per-table hashes.
 */
export function projectionHashes(domain: Domain): Record<string, string> {
  const tables = [
    'organisation',
    'project',
    'layer',
    'property',
    'propertyI18n',
    'propertyValue',
    'propertyValueI18n',
    'location',
    'locationRevision',
    'feature',
    'featureI18n',
    'featureProperty',
    'featurePropertyI18n',
    'featureLocation',
    'featureLocationMembership',
    'featureImage',
    'image',
    'task',
    'taskImage',
    'visit',
    'userFeature',
    'breadlineImportFeature',
  ]
  return Object.fromEntries(
    tables
      .filter(table =>
        domain.sqlite
          .query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(table),
      )
      .map(table => [
        table,
        createHash('sha256')
          .update(
            JSON.stringify(
              domain.sqlite
                .query(`SELECT * FROM "${table}"`)
                .all()
                .map(row => JSON.stringify(row))
                .sort(),
            ),
          )
          .digest('hex'),
      ]),
  )
}

/** Enrolls one complete legacy Feature and its still-pending task evidence.
 * @param domain Offline locked database. @param id Identity to enroll. @param pins Verified exact image revisions.
 * @param approved Exact published submission retained for staff review, if applicable.
 * @returns Nothing; any failure rolls back the enclosing per-Feature transaction.
 * @remarks Completed tasks and all normalized projections remain unchanged. Ambiguous ownership
 * blocks enrollment rather than manufacturing contributor attribution or publishing pending photos.
 */
async function enrollFeature(
  domain: Domain,
  id: string,
  pins: Map<string, Pin>,
  approved?: PublishedSubmission,
): Promise<void> {
  const { db, sqlite } = domain
  const source = await readFeatureRevisionSource(db, id, sql`1`)
  if (!source) throw new Error('Feature disappeared')
  const parsed = parseFeatureRevisionSource(source.snapshot)
  const tasks = sqlite
    .query(
      'SELECT id,type,contributorId,isDraft FROM task WHERE featureId=? AND isReviewed=0 ORDER BY id',
    )
    .all(id) as PendingTask[]
  const initialTasks = tasks.filter(task => task.type === 'newFeature')
  const published = Boolean(parsed.record.localIsPublished ?? parsed.record.isPublished)
  if (approved) verifyPublishedSubmission(sqlite, approved)
  if (initialTasks.length > 1 || (initialTasks.length && published && !approved))
    throw new Error('Ambiguous initial contribution state')
  const photos = sqlite
    .query(
      `SELECT DISTINCT i.id,i.contributorId FROM image i JOIN taskImage ti ON ti.imageId=i.id
    JOIN task t ON t.id=ti.taskId WHERE t.featureId=? AND t.isReviewed=0 ORDER BY i.id`,
    )
    .all(id) as { id: string; contributorId: string | null }[]
  const required = new Set([
    ...parsed.galleryLinks.map(link => String(link.imageId)),
    ...photos.map(photo => photo.id),
  ])
  for (const imageId of required)
    if (!pins.has(imageId)) throw new Error(`Unverified image ${imageId}`)
  const images = new Map(parsed.images.map(image => [image.id, image]))
  const links = [...parsed.galleryLinks].sort(
    (a, b) =>
      intentOrder.indexOf(String(a.intent)) - intentOrder.indexOf(String(b.intent)) ||
      String(images.get(b.imageId)?.createdAt).localeCompare(
        String(images.get(a.imageId)?.createdAt),
      ) ||
      String(a.imageId).localeCompare(String(b.imageId)),
  )
  const content = buildFeatureRevisionBaselineContent(source.snapshot, {
    revisions: Object.fromEntries(
      links.map(link => [
        String(link.imageId),
        pins.get(String(link.imageId))!.imageRevisionId,
      ]),
    ),
    order: links.map(link => String(link.imageId)),
  })
  const baseline = await initializeFeatureRevision(db, {
    featureId: id,
    actorId,
    guard: source.unchanged,
    content,
    published,
    reason:
      'Verified legacy baseline; recorded contribution/review attribution retained separately; earlier edit-by-edit history is unavailable',
  })
  if (!baseline) throw new Error('Feature source changed')
  const initialContent = structuredClone(content)
  // A separate photo branch retains each uploader and the exact original task attachments.
  for (const photo of photos) {
    const attachedIds = new Set(
      (
        sqlite.query('SELECT taskId FROM taskImage WHERE imageId=?').all(photo.id) as {
          taskId: string
        }[]
      ).map(row => row.taskId),
    )
    const attached = tasks.filter(task => attachedIds.has(task.id))
    if (
      !photo.contributorId ||
      attached.some(task => task.contributorId !== photo.contributorId)
    )
      throw new Error('Ambiguous task photo contributor')
    if (
      sqlite
        .query('SELECT 1 FROM featureImageUploadRevision WHERE assetVersionId=?')
        .get(pins.get(photo.id)!.assetVersionId)
    )
      throw new Error(
        'Image already belongs to another upload receipt; explicit shared-evidence review required',
      )
    if (new Set(attached.map(task => task.isDraft)).size > 1)
      throw new Error('Shared photo has both draft and submitted tasks')
    const research = attached.some(task => task.type === 'reportedMissing')
    const candidate = structuredClone(content)
    const entry: FeatureRevisionContent['gallery']['entries'][string] = {
      imageRevisionId: pins.get(photo.id)!.imageRevisionId,
      intent: research
        ? 'research'
        : (content.gallery.entries[photo.id]?.intent ?? 'undefined'),
      isPublished: !research,
      caption: {},
      alt: {},
    }
    // The submitted photo is already in this approved published gallery with its exact presentation.
    if (!approved || photo.id !== approved.imageId)
      candidate.gallery.entries[photo.id] = entry
    if (!candidate.gallery.order.includes(photo.id))
      candidate.gallery.order.push(photo.id)
    const proposal = await prepareFeatureRevisionProposal(db, {
      featureId: id,
      baseRevisionId: baseline,
      content: candidate,
      actorId,
      contributorId: photo.contributorId,
      origin: 'migration',
      guard: sql`1`,
      reason: 'Enrolled legacy task photo evidence',
    })
    if (
      !(await executeRevisionBatch(db, proposal.guard, [
        ...proposal.statements,
        db.insert(featureImageUploadRevision).values({
          id: crypto.randomUUID(),
          featureId: id,
          proposalId: proposal.proposalId,
          candidateRevisionId: proposal.candidateRevisionId,
          imageId: photo.id,
          ...pins.get(photo.id)!,
          actorId: photo.contributorId,
          taskIds: attached.map(task => task.id).sort(),
        }),
      ]))
    )
      throw new Error('Photo enrollment changed')
    if (!attached[0].isDraft) await retainSubmission(domain, id, proposal)
    if (initialTasks.length && attachedIds.has(initialTasks[0].id)) {
      initialContent.gallery.entries[photo.id] = entry
      if (!initialContent.gallery.order.includes(photo.id))
        initialContent.gallery.order.push(photo.id)
    }
  }
  if (!published) {
    const contributor = initialTasks[0]?.contributorId ?? parsed.record.contributorId
    if (initialTasks.length && !contributor)
      throw new Error('Initial contribution has no author')
    const proposal = await prepareFeatureRevisionProposal(db, {
      featureId: id,
      baseRevisionId: baseline,
      content: initialContent,
      actorId,
      contributorId: typeof contributor === 'string' ? contributor : actorId,
      origin: 'migration',
      guard: sql`1`,
      reason: 'Retained legacy unpublished content',
    })
    if (
      !(await executeRevisionBatch(db, proposal.guard, [
        ...proposal.statements,
        db.insert(featureInitialRevision).values({
          featureId: id,
          proposalId: proposal.proposalId,
          mode: initialTasks.length ? 'contribution' : 'staff',
        }),
      ]))
    )
      throw new Error('Initial enrollment changed')
    if (initialTasks.length && !initialTasks[0].isDraft)
      await retainSubmission(domain, id, proposal)
  }
}

/** Enrolls verified media and complete Feature cohorts in an explicit offline database.
 * @param database Existing rehearsal or stopped local database. @param cache Exact-media cache directory.
 * @param output Private receipt filename. @returns Count-only result plus blocked identities in the receipt.
 * @param transaction Optional already-locked offline connection for atomic local activation.
 * @param options Optional Feature scope and explicit authorization to consume empty recovery evidence.
 * @remarks No network access, no creation-policy activation, no implicit fallback metadata. Each Feature is atomic;
 * independent verified images persist for resumability. Run again to retry unresolved evidence.
 */
export async function enrollLegacyRevisions(
  database: string,
  cache: string,
  output: string,
  transaction?: Domain,
  options: LegacyMediaOptions & {
    publishedSubmissions?: readonly PublishedSubmission[]
  } = {},
): Promise<{ images: number; features: number; blocked: number }> {
  process.umask(0o077)
  const domain = transaction ?? openSqliteDomain(database),
    pins = new Map<string, Pin>()
  const blocked: { kind: string; id: string; reason: string }[] = []
  const before = projectionHashes(domain)
  let features = 0
  try {
    validateMediaScope(domain.sqlite, options)
    const rows = scopedMediaRows(
      domain.sqlite,
      options.featureIds,
      options.baselineOnly,
    )
    for (const row of rows) {
      try {
        const base = join(cache, mediaCacheKey(row)),
          evidence = JSON.parse(
            readFileSync(base + '.receipt.json', 'utf8'),
          ) as MediaEvidence
        const approval = options.approvedImages?.[mediaCacheKey(row)]
        const recoveryReason = approval?.reason ?? options.emptyMetadataReason
        if (
          evidence.status !== 'verified' ||
          JSON.stringify(evidence.locator) !== JSON.stringify(row)
        )
          throw new Error(evidence.reason ?? 'Exact evidence unavailable')
        if (
          evidence.metadataRecovery &&
          (!recoveryReason ||
            evidence.metadataRecovery.reason !== recoveryReason ||
            (approval && evidence.contentHash !== approval.contentHash))
        )
          throw new Error(
            'Empty metadata evidence requires explicit recovery authorization',
          )
        const bytes = readFileSync(base + '.image'),
          metadata = readFileSync(base + '.json')
        if (
          createHash('sha256').update(bytes).digest('hex') !== evidence.contentHash ||
          createHash('sha256').update(metadata).digest('hex') !== evidence.metadataHash
        )
          throw new Error('Cached evidence changed')
        if (evidence.retainedImageRevisionId) {
          const retained = retainedMetadata(domain.sqlite, row)
          if (
            !retained ||
            retained.imageRevisionId !== evidence.retainedImageRevisionId ||
            retained.metadata !== metadata.toString() ||
            retained.contentHash !== evidence.contentHash
          )
            throw new Error('Retained metadata evidence changed')
        }
        const pin =
          verifiedRetainedPin(domain.sqlite, row, {
            contentHash: evidence.contentHash!,
            byteSize: bytes.length,
            mediaType: evidence.mediaType!,
            metadata: JSON.parse(metadata.toString()),
          }) ??
          (await registerImageRevisionBaseline(domain.db, {
            imageId: row.id,
            actorId,
            guard: sql`1`,
            origin: 'migration',
            expectedModifiedAt: row.modifiedAt,
            storageNamespace: row.env as 'local' | 'preview' | 'production',
            storageKey: row.publicId,
            expectedVersion: row.version,
            bytes: bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
            mediaType: evidence.mediaType!,
            metadata: JSON.parse(metadata.toString()),
            metadataRecovery: evidence.metadataRecovery,
            captureCurrentPresentation: true,
            reason: evidence.metadataRecovery
              ? `Empty metadata recovery: ${evidence.metadataRecovery.reason}`
              : undefined,
          }))
        if (!pin) throw new Error('Image changed since capture')
        pins.set(row.id, pin)
      } catch (error) {
        blocked.push({
          kind: 'image',
          id: row.id,
          reason: error instanceof Error ? error.message : 'Image enrollment failed',
        })
      }
    }
    const scopedFeatures = options.featureIds
      ? options.featureIds.map(id => ({ id }))
      : (domain.sqlite.query('SELECT id FROM feature ORDER BY id').all() as {
          id: string
        }[])
    for (const { id } of scopedFeatures) {
      if (
        domain.sqlite
          .query('SELECT 1 FROM featureRevisionHead WHERE featureId=?')
          .get(id)
      )
        continue
      const nested = domain.sqlite.inTransaction
      domain.sqlite.exec(nested ? 'SAVEPOINT feature_enrollment' : 'BEGIN IMMEDIATE')
      try {
        const approved = options.publishedSubmissions?.find(row => row.featureId === id)
        await enrollFeature(domain, id, pins, approved)
        domain.sqlite.exec(nested ? 'RELEASE feature_enrollment' : 'COMMIT')
        features++
      } catch (error) {
        domain.sqlite.exec(nested ? 'ROLLBACK TO feature_enrollment' : 'ROLLBACK')
        if (nested) domain.sqlite.exec('RELEASE feature_enrollment')
        blocked.push({
          kind: 'feature',
          id,
          reason: error instanceof Error ? error.message : 'Feature enrollment failed',
        })
      }
    }
    const after = projectionHashes(domain)
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Enrollment changed normalized projections')
    if (domain.sqlite.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign key check failed')
    const integrity = domain.sqlite.query('PRAGMA integrity_check').values()
    if (JSON.stringify(integrity) !== '[["ok"]]')
      throw new Error('Integrity check failed')
    const result = { images: pins.size, features, blocked: blocked.length }
    writeFileSync(
      output,
      JSON.stringify(
        {
          status: blocked.length ? 'partial-verified' : 'verified',
          ...result,
          before,
          after,
          issues: blocked,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    return result
  } finally {
    if (!transaction) domain.close()
  }
}

if (import.meta.main) {
  const [database, cache, output] = process.argv.slice(2)
  if (!database || !cache || !output)
    throw new Error('Usage: enroll.ts DATABASE CACHE_DIRECTORY RECEIPT')
  console.log(JSON.stringify(await enrollLegacyRevisions(database, cache, output)))
}
