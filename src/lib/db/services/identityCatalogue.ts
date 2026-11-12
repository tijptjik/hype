import {
  identityCatalogue,
  identityCatalogueRevision,
  identityCatalogueSource,
} from '../schema/identityCatalogue'
// DRIZZLE
import { eq, sql, type SQL } from 'drizzle-orm'
// DOMAIN
import {
  IdentityCatalogueContentSchema,
  seedIdentityCatalogue,
  type IdentityCatalogueContent,
  type IdentityCatalogueRecord,
} from '#lib/locations/identityCatalogue.js'
// TRANSACTIONS
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationBrand } from '#lib/locations/model.js'

// TABLE OF CONTENTS
// 1. Current and immutable catalogue reads
// 2. Attributed writes and upstream identity linking

/** Read a curated identity or an immutable retained version.
 * @param db Database. @param id Catalogue identity. @param version Optional historical version.
 * @returns Localized record, or null when absent.
 */
export async function readIdentityCatalogue(
  db: Database,
  id: string,
  version?: number,
): Promise<IdentityCatalogueRecord | null> {
  const row = await db.get<{
    id: string
    kind: 'brand' | 'group'
    version: number
    content: string
  }>(
    sql`SELECT c.id,c.kind,r.version,r.content FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=coalesce(${version ?? null},c.version) WHERE c.id=${id}`,
  )
  return row
    ? {
        id: row.id,
        kind: row.kind,
        version: row.version,
        ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
      }
    : null
}

/** Search names in every locale without expanding an unbounded identifier list.
 * @param db Database. @param kind Brand or corporate group. @param search Typed substring.
 * @param excludeDescendantsOf Optional group whose subtree cannot be selected as its parent.
 * @returns At most fifty current records for autocomplete.
 */
export async function searchIdentityCatalogue(
  db: Database,
  kind: 'brand' | 'group',
  search: string,
  excludeDescendantsOf?: string,
): Promise<IdentityCatalogueRecord[]> {
  const rows = await db.all<{
    id: string
    kind: 'brand' | 'group'
    version: number
    content: string
  }>(
    sql`SELECT c.id,c.kind,c.version,r.content FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind=${kind} AND c.id NOT IN (WITH RECURSIVE descendants(id) AS (SELECT id FROM identityCatalogue WHERE id=${excludeDescendantsOf ?? null} UNION SELECT child.id FROM identityCatalogue child JOIN descendants parent ON child.groupId=parent.id) SELECT id FROM descendants) AND (${search}='' OR EXISTS(SELECT 1 FROM identityCatalogueI18n names WHERE names.catalogueId=c.id AND names.version=c.version AND instr(lower(names.name),lower(${search}))>0)) ORDER BY json_extract(r.content,'$.i18n.en.name'),c.id LIMIT 50`,
  )
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    version: row.version,
    ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
  }))
}

/** Publish a version under an authorized guard; accepted Location references remain pinned.
 * @param db Database. @param input Identity, inspected version, localized values and actor.
 * @returns Saved version, or null for a concurrent edit.
 * @remarks An optional inline parent and its membership link are committed atomically.
 */
export async function saveIdentityCatalogue(
  db: Database,
  input: {
    id: string
    kind: 'brand' | 'group'
    expectedVersion: number
    content: IdentityCatalogueContent
    actorId: string
    guard: SQL
    newGroup?: { id: string; i18n: IdentityCatalogueContent['i18n'] }
  },
): Promise<IdentityCatalogueRecord | null> {
  const content = IdentityCatalogueContentSchema.parse(input.content)
  const newGroup = input.newGroup
    ? IdentityCatalogueContentSchema.parse({ i18n: input.newGroup.i18n, logo: null })
    : null
  if (
    input.newGroup &&
    (content.groupId !== input.newGroup.id || input.id === input.newGroup.id)
  )
    throw new Error('CATALOGUE_GROUP_REQUIRED')
  if (content.groupId && !newGroup) {
    const group = await readIdentityCatalogue(db, content.groupId)
    if (group?.kind !== 'group') throw new Error('CATALOGUE_GROUP_REQUIRED')
  }
  // Reject cycles before writing; database triggers repeat this check atomically at publication.
  if (content.groupId) {
    const cycle = await db.get<{ id: string }>(sql`
      WITH RECURSIVE ancestors(id) AS (
        SELECT ${content.groupId}
        UNION
        SELECT c.groupId FROM identityCatalogue c JOIN ancestors a ON c.id=a.id
        WHERE c.groupId IS NOT NULL
      ) SELECT id FROM ancestors WHERE id=${input.id}`)
    if (cycle) throw new Error('CATALOGUE_GROUP_CYCLE')
  }
  const version = input.expectedVersion + 1
  const guard =
    input.expectedVersion === 0
      ? sql`(${input.guard}) AND NOT EXISTS(SELECT 1 FROM identityCatalogue WHERE id=${input.id})`
      : sql`(${input.guard}) AND EXISTS(SELECT 1 FROM identityCatalogue WHERE id=${input.id} AND kind=${input.kind} AND version=${input.expectedVersion})`
  // Creating an inline group and linking its member is one guarded commit; failed saves leave no orphan.
  const groupGuard = input.newGroup
    ? sql`(${guard}) AND NOT EXISTS(SELECT 1 FROM identityCatalogue WHERE id=${input.newGroup.id})`
    : guard
  const result = await executeRevisionBatch(db, groupGuard, [
    ...(input.newGroup && newGroup
      ? [
          db
            .insert(identityCatalogue)
            .values({ id: input.newGroup.id, kind: 'group', version: 1 }),
          db.insert(identityCatalogueRevision).values({
            catalogueId: input.newGroup.id,
            version: 1,
            content: newGroup,
            actorId: input.actorId,
            createdAt: new Date().toISOString(),
          }),
        ]
      : []),
    ...(input.expectedVersion === 0
      ? [
          db
            .insert(identityCatalogue)
            .values({ id: input.id, kind: input.kind, version }),
        ]
      : []),
    db.insert(identityCatalogueRevision).values({
      catalogueId: input.id,
      version,
      content,
      actorId: input.actorId,
      createdAt: new Date().toISOString(),
    }),
    ...(input.expectedVersion
      ? [
          db
            .update(identityCatalogue)
            .set({ version })
            .where(eq(identityCatalogue.id, input.id)),
        ]
      : []),
  ])
  return result ? { id: input.id, kind: input.kind, version, ...content } : null
}

/** Register an imported brand once; later imports never overwrite curated translations.
 * @param db Database. @param brand Retained normalized upstream object. @param actorId Import attribution.
 * @returns Stable catalogue identity, initialized with locale fallback copies only on first import.
 * @remarks Identifier namespaces are preserved. Name-only brands share an exact normalized source key, never parsed branch/format guesses.
 */
export async function ensureImportedBrand(
  db: Database,
  brand: LocationBrand,
  actorId: string,
): Promise<IdentityCatalogueRecord> {
  const identifiers = Object.entries(brand.identifiers)
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b))
  const source = identifiers.length ? `brand:${identifiers[0][0]}` : 'brand:source-name'
  const sourceId = identifiers.length
    ? identifiers[0][1]
    : (brand.names.en || Object.values(brand.names).find(Boolean) || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
  if (!sourceId) throw new Error('BRAND_NAME_REQUIRED')
  const previous = await db.get<{ catalogueId: string }>(
    sql`SELECT catalogueId FROM identityCatalogueSource WHERE source=${source} AND sourceId=${sourceId}`,
  )
  if (previous) {
    const record = await readIdentityCatalogue(db, previous.catalogueId)
    if (!record) throw new Error('CATALOGUE_REVISION_UNAVAILABLE')
    return record
  }
  const id = crypto.randomUUID(),
    content = seedIdentityCatalogue(brand.names)
  // A competing import wins the same source key; the failed batch rolls back its unused identity.
  try {
    await db.batch([
      db.insert(identityCatalogue).values({ id, kind: 'brand', version: 1 }),
      db.insert(identityCatalogueRevision).values({
        catalogueId: id,
        version: 1,
        content,
        actorId,
        createdAt: new Date().toISOString(),
      }),
      db.insert(identityCatalogueSource).values({ source, sourceId, catalogueId: id }),
    ])
  } catch (cause) {
    const winner = await db.get<{ catalogueId: string }>(
      sql`SELECT catalogueId FROM identityCatalogueSource WHERE source=${source} AND sourceId=${sourceId}`,
    )
    if (!winner) throw cause
    const record = await readIdentityCatalogue(db, winner.catalogueId)
    if (!record) throw cause
    return record
  }
  return { id, kind: 'brand', version: 1, ...content }
}
