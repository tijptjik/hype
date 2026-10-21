// DRIZZLE
import { eq, gt } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// DB
import { divisionDefinition } from '#lib/db/schema/division.js'
// DOMAIN
import { readDivisionPolygons } from '#lib/divisions/geometry.js'
import { covers } from '../../../../workers/division-refresh/src/api'
import { SUBJECTIVE_DIVISIONS } from '#lib/addresses/divisions.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  AddressDivisionContext,
  AddressDivisionOverrides,
} from '#lib/addresses/divisions.js'

const attributesSchema = z.object({
  class: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  level: z.number().nullable().optional(),
  names: z.record(z.string(), z.object({ name: z.string().nullable() })).optional(),
  i18n: z.record(z.string(), z.object({ name: z.string().nullable() })).optional(),
})

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
      const division = {
        id: row.id,
        class: attributes.class!,
        category: attributes.category ?? '',
        level: attributes.level ?? null,
        names: attributes.names ?? attributes.i18n ?? {},
      }
      if (Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === division.class))
        result.options.push(division)
      const polygons = readDivisionPolygons(row.attributes)
      if (polygons.length) result.available = true
      if (polygons.some(polygon => covers(coordinates, polygon)))
        result.memberships.push(division)
    }
    after = page.length === 40 ? page.at(-1)!.id : undefined
  } while (after)
  return result
}

/** Validate stable subjective selections against their actual mirrored class at the write boundary.
 * @param db Request-local database. @param overrides Explicit selections, already shape-validated.
 * @returns Nothing; mismatched or unknown identities are rejected.
 * @remarks At most seven single-ID reads; no dynamically sized SQL parameter lists.
 */
export async function validateAddressDivisionOverrides(
  db: Database,
  overrides: AddressDivisionOverrides,
): Promise<void> {
  for (const [field, kind] of Object.entries(SUBJECTIVE_DIVISIONS)) {
    const id = overrides[field as keyof typeof SUBJECTIVE_DIVISIONS]
    if (typeof id !== 'string') continue
    const record = await db
      .select()
      .from(divisionDefinition)
      .where(eq(divisionDefinition.id, id))
      .get()
    const parsed = attributesSchema.safeParse(record?.attributes)
    if (!parsed.success || parsed.data.class !== kind)
      throw new Error('INVALID_ADDRESS_DIVISION')
  }
}
