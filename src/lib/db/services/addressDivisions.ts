// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. MARKER GEOGRAPHY
// - catalogueRelease
// - readCatalogue
// - readMarkerDistricts
// - readAddressDivisionContext
// - resolveCataloguePoint
// 2. SELECTION VALIDATION
// - validateAddressDivisionOverrides
// ---

// DRIZZLE
import { and, eq, gt, or, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// DB
import { divisionDefinition, divisionGeometryPart } from '#lib/db/schema/division.js'
// DOMAIN
import { divisionPolygonSchema, readDivisionPolygons } from '#lib/divisions/geometry.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
import {
  bounds as polygonBounds,
  covers,
} from '../../../../workers/division-refresh/src/api'
import {
  AddressDivisionHierarchiesSchema,
  AddressDivisionOverridesSchema,
  isApprovedLocalityPath,
  SUBJECTIVE_DIVISIONS,
} from '#lib/addresses/divisions.js'
import { readMirroredDivisionPolygons } from './divisionGeometry'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  AddressDivisionContext,
  AddressDivisionOverrides,
  AddressDivision,
} from '#lib/addresses/divisions.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. MIRRORED METADATA
// 2. MARKER MEMBERSHIPS AND ANCESTRY
// 3. OVERRIDE VALIDATION

const attributesSchema = z.object({
  class: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  level: z.number().nullable().optional(),
  names: z.record(z.string(), z.object({ name: z.string().nullable() })).optional(),
  i18n: z.record(z.string(), z.object({ name: z.string().nullable() })).optional(),
  hierarchies: AddressDivisionHierarchiesSchema.optional().catch(undefined),
})

// +++ Marker Geography

type CatalogueEntry = {
  division: AddressDivision
  bounds: number[] | null
  hasPolygons: boolean
}
type Catalogue = { release: string | null; entries: CatalogueEntry[] }
// Cache completed metadata only, scoped to the D1 binding and published release; never retain request promises or geometry.
const catalogueCache = new WeakMap<object, { value: Catalogue; expires: number }>()
const boundsSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])

/** Read the published release independently of an in-progress catalogue import.
 * @param db Request-local database. @returns Published release, or null before the first complete mirror.
 */
async function catalogueRelease(db: Database): Promise<string | null> {
  const rows = await db.all<{ release: string | null }>(
    sql`SELECT catalogueRelease AS release FROM divisionRefresh WHERE id=1`,
  )
  return rows[0]?.release ?? null
}

/** Read reusable labels, ancestry and bounds without transferring polygon coordinates.
 * @param db Request-local database. @param release Published catalogue identity.
 * @returns Compact catalogue; incomplete mirrors are deliberately not cached.
 */
async function readCatalogue(db: Database, release: string | null): Promise<Catalogue> {
  const binding = (db as Database & { $client?: object }).$client ?? db
  const cached = catalogueCache.get(binding)
  if (release && cached?.value.release === release && cached.expires > Date.now())
    return structuredClone(cached.value)
  const entries: CatalogueEntry[] = []
  let after: string | undefined
  do {
    const page = await db
      .select({
        id: divisionDefinition.id,
        // Project only membership metadata, avoiding both polygon transfer and large raw-source payloads.
        attributes: sql`json_object(
        'class', json_extract(${divisionDefinition.attributes}, '$.class'),
        'category', json_extract(${divisionDefinition.attributes}, '$.category'),
        'level', json_extract(${divisionDefinition.attributes}, '$.level'),
        'names', coalesce(json_extract(${divisionDefinition.attributes}, '$.names'), json_extract(${divisionDefinition.attributes}, '$.i18n'), json('{}')),
        'hierarchies', json_extract(${divisionDefinition.attributes}, '$.hierarchies')
      )`.mapWith(divisionDefinition.attributes),
        bounds:
          sql`json_extract(${divisionDefinition.attributes}, '$.membershipBounds')`.mapWith(
            value => (typeof value === 'string' ? JSON.parse(value) : value),
          ),
        hasPolygons: sql<number>`(coalesce(json_array_length(${divisionDefinition.attributes}, '$.membershipGeometry'), 0) > 0 OR coalesce(json_extract(${divisionDefinition.attributes}, '$.membershipGeometryExternal'), 0))`,
      })
      .from(divisionDefinition)
      .where(
        and(
          after ? gt(divisionDefinition.id, after) : undefined,
          release ? eq(divisionDefinition.apiReleaseSet, release) : undefined,
        ),
      )
      .orderBy(divisionDefinition.id)
      .limit(512)
    for (const row of page) {
      const parsed = attributesSchema.safeParse(row.attributes)
      if (!parsed.success || !parsed.data.class || parsed.data.class === 'city')
        continue
      const attributes = parsed.data
      const bounds = boundsSchema.safeParse(row.bounds)
      entries.push({
        division: {
          id: row.id,
          class: attributes.class ?? '',
          category: attributes.category ?? '',
          level: attributes.level ?? null,
          names: attributes.names ?? {},
          ...(attributes.hierarchies ? { hierarchies: attributes.hierarchies } : {}),
        },
        bounds:
          bounds.success &&
          bounds.data[0] <= bounds.data[2] &&
          bounds.data[1] <= bounds.data[3]
            ? bounds.data
            : null,
        hasPolygons: Boolean(row.hasPolygons),
      })
    }
    after = page.length === 512 ? page.at(-1)?.id : undefined
  } while (after)
  const value = { release, entries }
  if (release)
    catalogueCache.set(binding, {
      value: structuredClone(value),
      expires: Date.now() + 60_000,
    })
  return value
}

/** Find the administrative districts covering a set of Location markers.
 * @param db Request-local database.
 * @param locations Effective, readable Location coordinates from the session projection.
 * @returns District names by Location ID, retaining both memberships at a shared boundary.
 */
export async function readMarkerDistricts(
  db: Database,
  locations: { id: string; coordinates: [number, number] | null }[],
): Promise<Map<string, string[]>> {
  const memberships = new Map<string, string[]>()
  const markers = locations.flatMap(({ id, coordinates }) =>
    coordinates ? [{ id, coordinates }] : [],
  )
  if (!markers.length) return memberships
  const release = await catalogueRelease(db)
  // Read just the district class, once for the whole list, and honor split polygon storage.
  const districts = await db
    .select()
    .from(divisionDefinition)
    .where(
      and(
        sql`json_extract(${divisionDefinition.attributes}, '$.class') = 'district'`,
        release ? eq(divisionDefinition.apiReleaseSet, release) : undefined,
      ),
    )
  for (const district of districts) {
    const metadata = attributesSchema.parse(district.attributes)
    const names = metadata.names ?? metadata.i18n ?? {}
    const label =
      names.en?.name || Object.values(names).find(row => row.name)?.name || district.id
    const polygons = await readMirroredDivisionPolygons(
      db,
      district.id,
      district.attributes,
    )
    const bounds = polygonBounds(polygons)
    if (!bounds) continue
    for (const { id, coordinates } of markers) {
      const [x, y] = coordinates
      if (x < bounds[0] || y < bounds[1] || x > bounds[2] || y > bounds[3]) continue
      if (polygons.some(polygon => covers(coordinates, polygon))) {
        const labels = memberships.get(id) ?? []
        labels.push(label)
        memberships.set(id, labels)
      }
    }
  }
  return memberships
}

/** Resolve marker memberships with a metadata bounding-box pass before any geometry reads.
 * @param db Request-local database. @param coordinates WGS84 marker point.
 * @returns Ordered memberships and the complete public locality choices.
 * @remarks Candidate IDs use primary-key reads; geometry is never cached. Retry once if publication overlaps a lookup.
 */
export async function readAddressDivisionContext(
  db: Database,
  coordinates: [number, number],
): Promise<AddressDivisionContext> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const release = await catalogueRelease(db)
    const catalogue = await readCatalogue(db, release)
    const result = await resolveCataloguePoint(db, catalogue, coordinates)
    if ((await catalogueRelease(db)) === release) return result
  }
  throw new Error('DIVISION_CATALOGUE_CHANGED')
}

/** Resolve exact coverage only for compact-catalogue bounding-box candidates.
 * @param db Request-local database. @param catalogue Release-scoped metadata. @param coordinates Marker point.
 * @returns Geography, including complete options and explicitly contained landform ancestors.
 */
async function resolveCataloguePoint(
  db: Database,
  catalogue: Catalogue,
  coordinates: [number, number],
): Promise<AddressDivisionContext> {
  const definitions = new Map(
    catalogue.entries.map(entry => [entry.division.id, entry.division]),
  )
  const result: AddressDivisionContext = {
    memberships: [],
    options: catalogue.entries
      .filter(({ division }) =>
        Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === division.class),
      )
      .map(entry => entry.division),
    available: catalogue.entries.some(entry => entry.hasPolygons),
  }
  // Missing bounds remain eligible: old or incomplete metadata must never suppress real polygon coverage.
  const candidates = catalogue.entries.filter(
    ({ bounds, hasPolygons }) =>
      hasPolygons &&
      (!bounds ||
        (coordinates[0] >= bounds[0] &&
          coordinates[0] <= bounds[2] &&
          coordinates[1] >= bounds[1] &&
          coordinates[1] <= bounds[3])),
  )
  const ids = candidates.map(entry => entry.division.id)
  const memberships = new Set<string>()
  const external: string[] = []
  let after: string | undefined
  if (ids.length)
    do {
      const page = await db
        .select({
          id: divisionDefinition.id,
          attributes:
            sql`json_object('membershipGeometry', json_extract(${divisionDefinition.attributes}, '$.membershipGeometry'), 'membershipGeometryExternal', json(CASE WHEN json_extract(${divisionDefinition.attributes}, '$.membershipGeometryExternal') = 1 THEN 'true' ELSE 'false' END))`.mapWith(
              divisionDefinition.attributes,
            ),
        })
        .from(divisionDefinition)
        .where(
          and(
            chunkedInArray(divisionDefinition.id, ids),
            after ? gt(divisionDefinition.id, after) : undefined,
            catalogue.release
              ? eq(divisionDefinition.apiReleaseSet, catalogue.release)
              : undefined,
          ),
        )
        .orderBy(divisionDefinition.id)
        .limit(40)
      for (const row of page) {
        if (
          z
            .object({ membershipGeometryExternal: z.literal(true) })
            .safeParse(row.attributes).success
        )
          external.push(row.id)
        else if (
          readDivisionPolygons(row.attributes).some(polygon =>
            covers(coordinates, polygon),
          )
        )
          memberships.add(row.id)
      }
      after = page.length === 40 ? page.at(-1)?.id : undefined
    } while (after)
  // Read external parts in bounded pages across candidates, rather than one round trip per division.
  let cursor: { id: string; part: number } | undefined
  if (external.length)
    do {
      const page = await db
        .select({
          id: divisionGeometryPart.divisionId,
          part: divisionGeometryPart.part,
          geometries: divisionGeometryPart.geometries,
        })
        .from(divisionGeometryPart)
        .where(
          and(
            chunkedInArray(divisionGeometryPart.divisionId, external),
            cursor
              ? or(
                  gt(divisionGeometryPart.divisionId, cursor.id),
                  and(
                    eq(divisionGeometryPart.divisionId, cursor.id),
                    gt(divisionGeometryPart.part, cursor.part),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(divisionGeometryPart.divisionId, divisionGeometryPart.part)
        .limit(4)
      for (const row of page) {
        if (
          !memberships.has(row.id) &&
          z
            .array(divisionPolygonSchema)
            .parse(row.geometries)
            .some(polygon => covers(coordinates, polygon))
        )
          memberships.add(row.id)
      }
      const last = page.at(-1)
      cursor = page.length === 4 && last ? { id: last.id, part: last.part } : undefined
    } while (cursor)
  result.memberships = catalogue.entries
    .filter(entry => memberships.has(entry.division.id))
    .map(entry => entry.division)
  // Island groups need not have their own polygon when an island explicitly belongs to them.
  const membershipIds = new Set(result.memberships.map(item => item.id))
  for (const member of result.memberships) {
    if (member.category !== 'landform') continue
    for (const entry of member.hierarchies?.landform?.flat() ?? []) {
      if (entry.fullContainment !== true || membershipIds.has(entry.id)) continue
      const ancestor = definitions.get(entry.id)
      if (ancestor?.category !== 'landform') continue
      membershipIds.add(ancestor.id)
      result.memberships.push(ancestor)
    }
  }
  return result
}

// ---
// +++ Selection Validation

/** Validate stable subjective selections against their actual mirrored class at the write boundary.
 * @param db Request-local database. @param overrides Explicit selections, already shape-validated.
 * @returns Nothing; mismatched or unknown identities are rejected.
 * @remarks Each distinct ID is read once; one selected path must match the source neighbourhood ancestry verbatim.
 */
export async function validateAddressDivisionOverrides(
  db: Database,
  overrides: AddressDivisionOverrides,
): Promise<void> {
  const shape = AddressDivisionOverridesSchema.safeParse(overrides)
  if (!shape.success) throw new Error('INVALID_ADDRESS_DIVISION')
  const definitions = new Map<string, AddressDivision>()
  const ids = new Set(overrides.localityPath ?? [])
  // Resolve the selected neighbourhood and validate its existing source path, never client-authored edges.
  for (const id of ids) {
    const record = await db
      .select()
      .from(divisionDefinition)
      .where(eq(divisionDefinition.id, id))
      .get()
    const parsed = attributesSchema.safeParse(record?.attributes)
    if (!parsed.success || !parsed.data.class)
      throw new Error('INVALID_ADDRESS_DIVISION')
    definitions.set(id, {
      id,
      class: parsed.data.class,
      category: parsed.data.category ?? '',
      level: parsed.data.level ?? null,
      names: parsed.data.names ?? parsed.data.i18n ?? {},
      hierarchies: parsed.data.hierarchies,
    })
  }
  if (
    overrides.localityPath?.length &&
    !isApprovedLocalityPath(overrides.localityPath, definitions)
  )
    throw new Error('INVALID_ADDRESS_DIVISION')
}

// ---
