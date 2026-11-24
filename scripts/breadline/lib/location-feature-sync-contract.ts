// SYNC
import { userSyncHash } from './user-sync-contract'
// TYPES
import type { FeatureSource } from './feature-sync'
import type { LocationFacts } from '../../../src/lib/locations/model'
import type { D1Database } from '@cloudflare/workers-types'

export type SyncStatement = { sql: string; params: (string | number | null)[] }
export type LocationSyncGroup = {
  identity: string
  featureId: string
  beforeRevision: string | null
  afterRevision: string
  sourceHash: string
  statements: SyncStatement[]
}
export type LocationFeatureSyncState = {
  version: 2
  targetIdentity: string
  source: FeatureSource
  featureIds: Record<string, string>
  projections: Record<string, LocationFacts>
  planHash: string
}
export type LocationFeatureSyncPlan = Omit<LocationFeatureSyncState, 'planHash'> & {
  previousPlanHash: string
  schemaHash: string
  groups: LocationSyncGroup[]
  exceptions: { identity: string; reason: string; fields?: string[] }[]
  counts: { created: number; updated: number; unchanged: number; excluded: number }
}

/** Hash executable schema definitions, excluding engine-owned metadata.
 * @param rows Complete sqlite_schema definitions.
 * @returns Stable schema identity used before offline and remote replay.
 */
export function locationSyncSchemaHash(rows: Record<string, unknown>[]): string {
  return userSyncHash(
    rows
      .filter(r => r.sql && !/^(sqlite_|_cf_)/.test(String(r.name)))
      .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
  )
}

/** Apply one attributed current-schema Feature transaction, accepting an exact lost-response retry.
 * @param db Current Location and Feature revision binding.
 * @param group Reviewed statements and accepted revision identity.
 * @returns Nothing after atomic completion and revision readback.
 * @remarks Independent later edits fail closed; no trigger or foreign-key guards are disabled.
 */
export async function applyLocationFeatureSyncGroup(
  db: D1Database,
  group: LocationSyncGroup,
): Promise<void> {
  const [table, id] = group.identity.split(':')
  const read = () =>
    db
      .prepare(`SELECT f.currentRevisionId,b.sourceHash FROM breadlineImportFeature b
    JOIN feature f ON f.id=b.featureId WHERE b.sourceTable=? AND b.sourceId=? AND f.id=?`)
      .bind(table, id, group.featureId)
      .first<{ currentRevisionId: string; sourceHash: string }>()
  const current = await read()
  if (
    current?.currentRevisionId === group.afterRevision &&
    current.sourceHash === group.sourceHash
  )
    return
  if ((current?.currentRevisionId ?? null) !== group.beforeRevision)
    throw new Error('Feature sync revision drift')
  if (
    !group.statements.length ||
    group.statements.length > 900 ||
    group.statements.some(
      s => s.params.length > 100 || new TextEncoder().encode(s.sql).length > 95000,
    ) ||
    new TextEncoder().encode(JSON.stringify(group.statements)).length > 15 * 1024 * 1024
  )
    throw new Error('Feature sync transaction exceeds D1 budget')
  await db.batch(group.statements.map(s => db.prepare(s.sql).bind(...s.params)))
  const after = await read()
  if (
    after?.currentRevisionId !== group.afterRevision ||
    after.sourceHash !== group.sourceHash
  )
    throw new Error('Feature sync after-state differs')
}
