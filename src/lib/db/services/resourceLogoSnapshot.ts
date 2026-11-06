// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/** Detects the additive logo pin storage without caching migration state.
 * @param db Request database.
 * @returns Whether exact logo recording is installed.
 */
export async function hasResourceLogoStorage(db: Database): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('resourceLogoImageHead','organisationRevisionLogo','projectRevisionLogo','hubRevisionLogo')`,
  )
  if (!row?.n) return false
  if (row.n !== 4) throw new Error('Incomplete resource logo revision migration')
  return true
}

/** Adds an exact logo pin only when one has actually been verified.
 * @param content Existing resource snapshot.
 * @param imageId Correlated current logo identity.
 * @param enabled Whether the additive schema exists.
 * @returns Snapshot with optional immutable logo evidence.
 * @remarks Older snapshots and resources without verified media keep their original shape.
 */
export function withResourceLogoSnapshot(
  content: SQL,
  imageId: SQL,
  enabled: boolean,
): SQL {
  if (!enabled) return content
  return sql`json_patch(${content},COALESCE((SELECT json_object('logo',json_object(
    'imageId',h.imageId,'imageRevisionId',h.imageRevisionId)) FROM resourceLogoImageHead h
    WHERE h.imageId=${imageId}),'{}'))`
}
