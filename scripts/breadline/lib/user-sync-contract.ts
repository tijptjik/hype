// NODE
import { createHash } from 'node:crypto'
// TYPES
import type { LegacyUser } from './users'

export type Row = Record<string, string | number | null>
export type SourceUserSnapshot = { user: LegacyUser; related: Record<string, Row[]> }
export type UserSyncSource = {
  complete: boolean
  snapshotAt: string
  rows: SourceUserSnapshot[]
}
export type UserSyncMutation = {
  table: string
  key: Row
  before: Row | null
  after: Row | null
}
export type UserSyncPlan = {
  version: 2
  targetIdentity: string
  organisationId: string
  baselineHash: string
  sourceHash: string
  sourceSnapshotAt: string
  previousPlanHash: string | null
  checkpointChanged: boolean
  mutations: UserSyncMutation[]
  exceptions: Array<{ sourceUserIds: number[]; reason: string }>
  counts: {
    source: number
    excluded: number
    created: number
    updated: number
    removed: number
    restored: number
  }
}
export const USER_SYNC_RUNTIME_TABLES = [
  'user',
  'account',
  'breadlineImportUser',
  'breadlineImportIdentity',
  'organisationRole',
] as const
export type UserSyncLocalState = { version: 1; rows: Row[]; checkpoint: Row | null }
/** Create an empty private sync baseline.
 * @returns Local-only source state without a checkpoint.
 */
export const emptyUserSyncLocalState = (): UserSyncLocalState => ({
  version: 1,
  rows: [],
  checkpoint: null,
})

/** Canonicalize nested values for stable fingerprints independent of property order.
 * @param value JSON-compatible input.
 * @returns Deterministic JSON text.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** Hash private state without including its values in logs.
 * @param value JSON-compatible state.
 * @returns SHA-256 fingerprint.
 */
export function userSyncHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}
