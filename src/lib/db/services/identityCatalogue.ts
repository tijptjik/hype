import { catalogueQualitySql } from './catalogueQualitySql'
import type { LogoQualityFilters } from '#lib/locations/catalogueQuality'
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
    wikidataId: string | null
  }>(
    sql`SELECT c.id,c.kind,r.version,r.content,(SELECT sourceId FROM identityCatalogueSource WHERE catalogueId=c.id AND source='brand:wikidata' LIMIT 1) wikidataId FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=coalesce(${version ?? null},c.version) WHERE c.id=${id}`,
  )
  return row
    ? {
        id: row.id,
        kind: row.kind,
        version: row.version,
        ...(row.wikidataId ? { wikidataId: row.wikidataId } : {}),
        ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
      }
    : null
}

/** Resolve a current code within its catalogue kind without guessing ambiguous matches.
 * @param db Database. @param kind Catalogue kind. @param code Exact public code.
 * @returns The unique identity, or null when missing or ambiguous.
 */
export async function readIdentityCatalogueByCode(
  db: Database,
  kind: 'brand' | 'group',
  code: string,
): Promise<IdentityCatalogueRecord | null> {
  const rows = await db.all<{ id: string }>(
    sql`SELECT c.id FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind=${kind} AND json_extract(r.content,'$.code')=${code} LIMIT 2`,
  )
  return rows.length === 1 ? readIdentityCatalogue(db, rows[0].id) : null
}

/** Search names in every locale without expanding an unbounded identifier list.
 * @param db Database. @param kind Brand or corporate group. @param search Typed substring.
 * @param excludeDescendantsOf Optional group whose subtree cannot be selected as its parent.
 * @param isArchived False for active entries, true for deleted entries, null for both.
 * @param independent True for no group association, false for a group association, null for either.
 * @param page Optional keyset cursor for index pages, including one lookahead record.
 * @returns At most fifty autocomplete records, or fifty-one index records.
 */
export async function searchIdentityCatalogue(
  db: Database,
  kind: 'brand' | 'group',
  search: string,
  excludeDescendantsOf?: string,
  isArchived: boolean | null = false,
  independent: boolean | null = null,
  page?: {
    after?: { name: string; id: string }
    quality?: LogoQualityFilters
    origin?: string
  },
): Promise<IdentityCatalogueRecord[]> {
  const rows = await db.all<{
    id: string
    kind: 'brand' | 'group'
    version: number
    content: string
  }>(
    sql`SELECT c.id,c.kind,c.version,r.content FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind=${kind} AND (${catalogueQualitySql(page?.quality)}) AND (${page?.origin ?? null} IS NULL OR (${page?.origin ?? null}='unrecorded' AND NOT EXISTS(SELECT 1 FROM identityCatalogueSource source WHERE source.catalogueId=c.id)) OR EXISTS(SELECT 1 FROM identityCatalogueSource source WHERE source.catalogueId=c.id AND source.source=${page?.origin ?? null})) AND (${isArchived === null ? null : Number(isArchived)} IS NULL OR coalesce(json_extract(r.content,'$.isArchived'),0)=${isArchived === null ? null : Number(isArchived)}) AND (${independent === null ? null : Number(independent)} IS NULL OR (c.groupId IS NULL)=${independent === null ? null : Number(independent)}) AND c.id NOT IN (WITH RECURSIVE descendants(id) AS (SELECT id FROM identityCatalogue WHERE id=${excludeDescendantsOf ?? null} UNION SELECT child.id FROM identityCatalogue child JOIN descendants parent ON child.groupId=parent.id) SELECT id FROM descendants) AND (${search}='' OR instr(lower(coalesce(json_extract(r.content,'$.code'),c.id)),lower(${search}))>0 OR EXISTS(SELECT 1 FROM identityCatalogueI18n names WHERE names.catalogueId=c.id AND names.version=c.version AND instr(lower(names.name),lower(${search}))>0)) AND (${page?.after?.id ?? null} IS NULL OR coalesce(json_extract(r.content,'$.i18n.en.name'),'') > ${page?.after?.name ?? ''} OR (coalesce(json_extract(r.content,'$.i18n.en.name'),'') = ${page?.after?.name ?? ''} AND c.id > ${page?.after?.id ?? ''})) ORDER BY coalesce(json_extract(r.content,'$.i18n.en.name'),''),c.id LIMIT ${page ? 51 : 50}`,
  )
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    version: row.version,
    ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
  }))
}

/** List current brands throughout a corporate group hierarchy.
 * @param db Database. @param groupId Persisted group identity.
 * @param includeAncestors Include the wider family sharing an ancestor, for sibling discovery.
 * @returns Unique linked brands ordered by their English fallback name.
 * @remarks Group profiles remain scoped to their subtree; sibling discovery spans the family.
 */
export async function listGroupBrands(
  db: Database,
  groupId: string,
  includeAncestors = false,
): Promise<IdentityCatalogueRecord[]> {
  // Traverse groups only; UNION deduplicates paths and terminates even on legacy cycles.
  const rows = await db.all<{ id: string; version: number; content: string }>(
    sql`WITH RECURSIVE activeGroups AS (
      SELECT c.id,c.groupId FROM identityCatalogue c
      JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
      WHERE c.kind='group' AND coalesce(json_extract(r.content,'$.isArchived'),0)=0
    ), ancestors(id) AS (
      SELECT id FROM activeGroups WHERE id=${groupId}
      UNION
      SELECT parent.id FROM activeGroups child JOIN ancestors a ON child.id=a.id
      JOIN activeGroups parent ON parent.id=child.groupId
      WHERE ${includeAncestors ? 1 : 0}=1
    ), family(id) AS (
      SELECT id FROM ancestors
      UNION
      SELECT child.id FROM activeGroups child JOIN family parent ON child.groupId=parent.id
    )
    SELECT c.id,c.version,r.content FROM identityCatalogue c
    JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
    WHERE c.kind='brand' AND coalesce(json_extract(r.content,'$.isArchived'),0)=0 AND c.groupId IN (SELECT id FROM family)
    ORDER BY json_extract(r.content,'$.i18n.en.name'),c.id`,
  )
  return rows.map(row => ({
    id: row.id,
    kind: 'brand',
    version: row.version,
    ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
  }))
}

/** List direct child groups without conflating them with descendant brands.
 * @param db Database. @param groupId Parent group identity.
 * @returns Current child groups ordered by English fallback name.
 */
export async function listSubgroups(
  db: Database,
  groupId: string,
): Promise<IdentityCatalogueRecord[]> {
  const rows = await db.all<{ id: string; version: number; content: string }>(
    sql`SELECT c.id,c.version,r.content FROM identityCatalogue c
    JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
    WHERE c.kind='group' AND coalesce(json_extract(r.content,'$.isArchived'),0)=0 AND c.groupId=${groupId}
    ORDER BY json_extract(r.content,'$.i18n.en.name'),c.id`,
  )
  return rows.map(row => ({
    id: row.id,
    kind: 'group',
    version: row.version,
    ...IdentityCatalogueContentSchema.parse(JSON.parse(row.content)),
  }))
}

/** Suggest an available group code; the revision guard reserves it atomically.
 * @param db Database. @param id Group identity. @param content Localized group names.
 * @param reserved Code being claimed by another group in this same save.
 * @returns A kebab-case code with a numeric suffix when the name is already claimed.
 */
async function availableGroupCode(
  db: Database,
  id: string,
  content: IdentityCatalogueContent,
  reserved?: string,
): Promise<string> {
  const name =
    content.i18n.en?.name ||
    Object.values(content.i18n).find(row => row.name.trim())?.name ||
    ''
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = (slug || `group-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
    .slice(0, 90)
    .replace(/-+$/g, '')
  const rows = await db.all<{ code: string }>(
    sql`SELECT json_extract(r.content,'$.code') code FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind='group' AND c.id<>${id} AND (json_extract(r.content,'$.code')=${base} OR json_extract(r.content,'$.code') LIKE ${`${base}-%`})`,
  )
  const used = new Set(rows.map(row => row.code))
  if (reserved) used.add(reserved)
  let code = base
  for (let suffix = 2; used.has(code); suffix++) code = `${base}-${suffix}`
  return code
}

/** Publish a version under an authorized guard; accepted Location references remain pinned.
 * @param db Database. @param input Identity, inspected version, localized values and actor.
 * @returns Saved version, or null for a concurrent edit.
 * @remarks An optional inline group and its membership link are committed atomically.
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
    wikidataId?: string
  },
): Promise<IdentityCatalogueRecord | null> {
  const content = IdentityCatalogueContentSchema.parse(input.content)
  if (input.kind === 'group' && !content.code)
    content.code = await availableGroupCode(db, input.id, content)
  if (
    input.wikidataId &&
    (input.kind !== 'brand' || !/^Q[1-9]\d{0,15}$/.test(input.wikidataId))
  )
    throw new Error('INVALID_WIKIDATA_BRAND')
  if (input.wikidataId) {
    const conflict = await db.get<{ id: string }>(
      sql`SELECT catalogueId id FROM identityCatalogueSource WHERE source='brand:wikidata' AND ((sourceId=${input.wikidataId} AND catalogueId<>${input.id}) OR (catalogueId=${input.id} AND sourceId<>${input.wikidataId})) LIMIT 1`,
    )
    if (conflict) throw new Error('WIKIDATA_BRAND_ALREADY_LINKED')
  }
  const newGroup = input.newGroup
    ? IdentityCatalogueContentSchema.parse({ i18n: input.newGroup.i18n, logo: null })
    : null
  if (newGroup && input.newGroup)
    newGroup.code = await availableGroupCode(
      db,
      input.newGroup.id,
      newGroup,
      input.kind === 'group' ? content.code : undefined,
    )
  if (
    input.newGroup &&
    (content.groupId !== input.newGroup.id || input.id === input.newGroup.id)
  )
    throw new Error('CATALOGUE_GROUP_REQUIRED')
  if (content.groupId && !newGroup) {
    const group = await readIdentityCatalogue(db, content.groupId)
    if (group?.kind !== 'group') throw new Error('CATALOGUE_GROUP_REQUIRED')
    if (
      group.isArchived &&
      (await readIdentityCatalogue(db, input.id))?.groupId !== content.groupId
    )
      throw new Error('CATALOGUE_GROUP_REQUIRED')
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
  // Reserve the code against current heads inside the same atomic revision guard.
  const codeGuard = content.code
    ? sql`(${guard}) AND NOT EXISTS(SELECT 1 FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.id<>${input.id} AND c.kind=${input.kind} AND json_extract(r.content,'$.code')=${content.code})`
    : guard
  // Creating an inline group and linking its member is one guarded commit; failed saves leave no orphan.
  const groupGuard = input.newGroup
    ? sql`(${codeGuard}) AND NOT EXISTS(SELECT 1 FROM identityCatalogue WHERE id=${input.newGroup.id}) AND NOT EXISTS(SELECT 1 FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.kind='group' AND json_extract(r.content,'$.code')=${newGroup!.code})`
    : codeGuard
  // Reserve the reviewed upstream identity in the same batch as the catalogue revision.
  const sourceGuard = input.wikidataId
    ? sql`(${groupGuard}) AND NOT EXISTS(SELECT 1 FROM identityCatalogueSource WHERE source='brand:wikidata' AND ((sourceId=${input.wikidataId} AND catalogueId<>${input.id}) OR (catalogueId=${input.id} AND sourceId<>${input.wikidataId})))`
    : groupGuard
  const result = await executeRevisionBatch(db, sourceGuard, [
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
    ...(input.wikidataId
      ? [
          db
            .insert(identityCatalogueSource)
            .values({
              source: 'brand:wikidata',
              sourceId: input.wikidataId,
              catalogueId: input.id,
            })
            .onConflictDoNothing(),
        ]
      : []),
    ...(input.expectedVersion
      ? [
          db
            .update(identityCatalogue)
            .set({ version })
            .where(eq(identityCatalogue.id, input.id)),
        ]
      : []),
  ])
  return result ? readIdentityCatalogue(db, input.id, version) : null
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
