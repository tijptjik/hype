// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. MARKER GEOGRAPHY
// - readAddressDivisionContext
// 2. SELECTION VALIDATION
// - validateAddressDivisionOverrides
// ---

// DRIZZLE
import { eq, gt } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// DB
import { divisionDefinition } from '#lib/db/schema/division.js'
// DOMAIN
import { readDivisionPolygons } from '#lib/divisions/geometry.js'
import { covers } from '../../../../workers/division-refresh/src/api'
import {
  AddressDivisionHierarchiesSchema,
  AddressDivisionOverridesSchema,
  isApprovedLocalityPath,
  SUBJECTIVE_DIVISIONS,
} from '#lib/addresses/divisions.js'
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

/** Resolve marker memberships from the mirrored authoritative polygons, without guessing by name.
 * @param db Request-local database. @param coordinates WGS84 marker point.
 * @returns Ordered UI-ready geography and public hood/locality choices; missing geometry remains explicit.
 * @remarks Scan bounded pages so large polygon registries do not become one oversized D1 response.
 */
export async function readAddressDivisionContext(
  db: Database,
  coordinates: [number, number],
): Promise<AddressDivisionContext> {
  const result: AddressDivisionContext = {
    memberships: [],
    options: [],
    available: false,
  }
  const definitions = new Map<string, AddressDivision>()
  let after: string | undefined
  do {
    const page = await db
      .select()
      .from(divisionDefinition)
      .where(after ? gt(divisionDefinition.id, after) : undefined)
      .orderBy(divisionDefinition.id)
      .limit(40)
    for (const row of page) {
      const parsed = attributesSchema.safeParse(row.attributes)
      if (!parsed.success || !parsed.data.class || parsed.data.class === 'city')
        continue
      const attributes = parsed.data
      const division: AddressDivision = {
        id: row.id,
        class: attributes.class ?? '',
        category: attributes.category ?? '',
        level: attributes.level ?? null,
        names: attributes.names ?? attributes.i18n ?? {},
        ...(attributes.hierarchies ? { hierarchies: attributes.hierarchies } : {}),
      }
      definitions.set(division.id, division)
      if (Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === division.class))
        result.options.push(division)
      const polygons = readDivisionPolygons(row.attributes)
      if (polygons.length) result.available = true
      if (polygons.some(polygon => covers(coordinates, polygon)))
        result.memberships.push(division)
    }
    after = page.length === 40 ? page.at(-1)?.id : undefined
  } while (after)
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
