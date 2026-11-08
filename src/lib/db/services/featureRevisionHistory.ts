// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { diffRevisionValues } from '#lib/revisions/diff.js'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { readFeatureImageMetadataChanges } from './featureImageRevisionReview'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

/**
 * Reads the actual before/after changes of a publication under current field permissions.
 * @param db Request database.
 * @param input Authorized Feature/generation and current internal-field access.
 * @returns Filtered changes, baseline/unpublication markers, or null for absent/revoked scope.
 * @remarks This compares accepted publication parents, including merge results and automatic
 * changes. Neither an old public classification nor publishing authority reveals internal values.
 */
export async function readFeaturePublicationChanges(
  db: Database,
  input: {
    featureId: string
    generation: number
    guard: SQL
    internalIds: ReadonlySet<string>
    allowedInternalIds: ReadonlySet<string>
  },
): Promise<{
  changes: RevisionDifference[]
  redacted: boolean
  baseline: boolean
  unpublished: boolean
} | null> {
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const row = await db.get<{
    before: string | null
    after: string | null
    current: string | null
    stateBefore?: string | null
    stateAfter?: string | null
  }>(
    lifecycle
      ? sql`
    SELECT b.content AS before,a.content AS after,c.content AS current,b.recordState stateBefore,a.recordState stateAfter
    FROM featureRevision a LEFT JOIN featureRevision b ON b.id=a.previousRevisionId AND b.featureId=a.featureId
    JOIN feature f ON f.id=a.featureId LEFT JOIN featureRevision c ON c.id=f.currentRevisionId AND c.featureId=f.id
    WHERE a.featureId=${input.featureId} AND a.sequence=${input.generation} AND (${input.guard})`
      : sql`
    SELECT b.content AS before,a.content AS after,c.content AS current
    FROM featureRevisionPublication p
    LEFT JOIN featureRevision b ON b.id=p.previousRevisionId AND b.featureId=p.featureId
    LEFT JOIN featureRevision a ON a.id=p.revisionId AND a.featureId=p.featureId
    LEFT JOIN featureRevisionHead h ON h.featureId=p.featureId
    LEFT JOIN featureRevisionPublication latest ON latest.featureId=h.featureId AND latest.generation=h.generation
    LEFT JOIN featureRevision c ON c.id=COALESCE(h.publishedRevisionId,latest.previousRevisionId) AND c.featureId=h.featureId
    WHERE p.featureId=${input.featureId} AND p.generation=${input.generation} AND (${input.guard})`,
  )
  if (!row) return null
  if (input.generation === 0 || !row.after)
    return {
      changes: [],
      redacted: false,
      baseline: input.generation === 0,
      unpublished: !row.after,
    }
  if (!row.before)
    return { changes: [], redacted: false, baseline: true, unpublished: false }
  const before = FeatureRevisionContentSchema.parse(JSON.parse(row.before))
  const after = FeatureRevisionContentSchema.parse(JSON.parse(row.after))
  const current = row.current
    ? FeatureRevisionContentSchema.parse(JSON.parse(row.current))
    : after
  const privateIds = new Set(input.internalIds)
  for (const content of [before, after, current])
    for (const [id, property] of Object.entries(content.properties))
      if (property.selection.definition.audience === 'internal') privateIds.add(id)
  const all = diffRevisionValues(
    { present: true, value: before },
    { present: true, value: after },
  )
  const changes = all.filter(
    change =>
      change.path[0] !== 'properties' ||
      (change.path.length > 1
        ? !privateIds.has(change.path[1]) ||
          input.allowedInternalIds.has(change.path[1])
        : [...privateIds].every(id => input.allowedInternalIds.has(id))),
  )
  const beforeState = row.stateBefore ? JSON.parse(row.stateBefore) : null,
    afterState = row.stateAfter ? JSON.parse(row.stateAfter) : null
  const stateChanges =
    lifecycle && beforeState && afterState
      ? diffRevisionValues(
          {
            present: true,
            value: {
              isPublished: beforeState.isPublished ?? null,
              isArchived: beforeState.isArchived ?? null,
            },
          },
          {
            present: true,
            value: {
              isPublished: afterState.isPublished ?? null,
              isArchived: afterState.isArchived ?? null,
            },
          },
        ).map(change => ({ ...change, path: ['recordState', ...change.path] }))
      : []
  return {
    changes: [
      ...changes,
      ...stateChanges,
      ...(await readFeatureImageMetadataChanges(db, before, after)),
    ],
    redacted: changes.length !== all.length,
    baseline: false,
    unpublished: Boolean(
      lifecycle &&
        beforeState?.isPublished === true &&
        afterState?.isPublished === false,
    ),
  }
}

/** Explains attributed unpublished maintenance while applying current property privacy.
 * @param db Request database. @param input Authorized identity and immutable private revision.
 * @returns Safe differences, or null when the revision is outside the private journal/scope.
 */
export async function readFeaturePrivateChanges(
  db: Database,
  input: {
    featureId: string
    revisionId: string
    guard: SQL
    internalIds: ReadonlySet<string>
    allowedInternalIds: ReadonlySet<string>
  },
): Promise<{ changes: RevisionDifference[]; redacted: boolean } | null> {
  if (await hasFeatureLifecycleStorage(db)) {
    const revision = await db.get<{ sequence: number | null }>(
      sql`SELECT sequence FROM featureRevision WHERE id=${input.revisionId} AND featureId=${input.featureId} AND (${input.guard})`,
    )
    if (revision?.sequence == null) return null
    const result = await readFeaturePublicationChanges(db, {
      ...input,
      generation: revision.sequence,
    })
    return result ? { changes: result.changes, redacted: result.redacted } : null
  }
  const row = await db.get<{
    before: string
    after: string
  }>(sql`SELECT b.content before,a.content after
    FROM featurePrivateCapture capture JOIN featureRevision a ON a.id=capture.revisionId AND a.featureId=capture.featureId
    JOIN featureRevision b ON b.id=a.previousRevisionId AND b.featureId=a.featureId
    WHERE capture.featureId=${input.featureId} AND capture.revisionId=${input.revisionId} AND (${input.guard})`)
  if (!row) return null
  const before = FeatureRevisionContentSchema.parse(JSON.parse(row.before)),
    after = FeatureRevisionContentSchema.parse(JSON.parse(row.after))
  const privateIds = new Set(input.internalIds)
  for (const content of [before, after])
    for (const [id, field] of Object.entries(content.properties))
      if (field.selection.definition.audience === 'internal') privateIds.add(id)
  const all = diffRevisionValues(
    { present: true, value: before },
    { present: true, value: after },
  )
  const changes = all.filter(
    change =>
      change.path[0] !== 'properties' ||
      (change.path.length > 1
        ? !privateIds.has(change.path[1]) ||
          input.allowedInternalIds.has(change.path[1])
        : [...privateIds].every(id => input.allowedInternalIds.has(id))),
  )
  return { changes, redacted: changes.length !== all.length }
}
