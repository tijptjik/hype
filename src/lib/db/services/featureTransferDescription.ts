// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

export type FeatureTransferPath = { from: string[]; to: string[] }

/** Resolve legacy transfer audit tokens into readable history descriptions.
 * @param db Request database after the caller has authorized Feature history access.
 * @param entries Authorized history rows; only transfer descriptions are replaced in this response.
 * @returns Completion after resolving resource names, without rewriting immutable audit records.
 * @remarks Missing translations use resource-type labels, never storage IDs.
 */
export async function describeFeatureTransfers(
  db: Database,
  entries: { reason: string | null; transfer?: FeatureTransferPath }[],
): Promise<void> {
  const pattern =
    /^Feature transferred from ([^/\s]+)\/([^/\s]+)\/([^/\s]+) to ([^/\s]+)\/([^/\s]+)\/([^/\s]+)$/
  const transfers = entries.flatMap(entry => {
    const match = entry.reason?.match(pattern)
    return match ? [{ entry, match }] : []
  })
  if (!transfers.length) return
  const tables = new Set(
    (
      await db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE name IN ('organisationI18n','projectI18n','layerI18n')`,
      )
    ).map(row => row.name),
  )
  const cache = new Map<string, string>()
  /** Resolve one name deterministically with a non-identifying fallback.
   * @param kind Resource namespace.
   * @param id Retained audit identity.
   * @returns Preferred short name, falling back to the full translated name or resource type.
   */
  async function name(
    kind: 'organisation' | 'project' | 'layer',
    id: string,
  ): Promise<string> {
    const key = `${kind}:${id}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const fallback = kind[0].toUpperCase() + kind.slice(1)
    const table = `${kind}I18n`
    const row = tables.has(table)
      ? await db.get<{ name: string }>(sql`
      SELECT COALESCE(NULLIF(trim(nameShort),''),name) AS name FROM ${sql.identifier(table)} WHERE ${sql.identifier(`${kind}Id`)}=${id}
      AND (trim(nameShort)!='' OR trim(name)!='') ORDER BY CASE WHEN locale='en' THEN 0 ELSE 1 END,locale LIMIT 1`)
      : null
    const label = row?.name ?? fallback
    cache.set(key, label)
    return label
  }
  for (const { entry, match } of transfers) {
    const ids = match.slice(1)
    const labels: string[] = []
    for (let i = 0; i < ids.length; i++)
      labels.push(
        await name((['organisation', 'project', 'layer'] as const)[i % 3], ids[i]),
      )
    entry.transfer = { from: labels.slice(0, 3), to: labels.slice(3) }
    entry.reason = `Feature moved from ${entry.transfer.from.join(' › ')} to ${entry.transfer.to.join(' › ')}`
  }
}
