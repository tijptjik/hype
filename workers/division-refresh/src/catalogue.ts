// VALIDATION
import { z } from 'zod'
// API
import { apiRead, bounds, polygonSchema } from './api'
// TYPES
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { ApiOptions, Polygon } from './api'

const areaReference = z.object({ type: z.literal('division-areas'), id: z.string() })
/** Full catalogue pages carry area resources; division label points are never territory. */
export const cataloguePageSchema = z.object({
  data: z.array(
    z.object({
      type: z.literal('divisions'),
      id: z.string(),
      attributes: z
        .object({
          class: z.string(),
          category: z.string(),
          level: z.number().nullable(),
          i18n: z.record(
            z.string(),
            z.object({ name: z.string().nullable() }).passthrough(),
          ),
          hierarchies: z.object({ full: z.array(z.array(z.unknown())) }).passthrough(),
        })
        .passthrough(),
      relationships: z.object({
        areas: z.object({ data: z.array(areaReference) }).optional(),
      }),
    }),
  ),
  included: z
    .array(
      z.object({
        type: z.literal('division-areas'),
        id: z.string(),
        attributes: z.object({
          divisionId: z.string(),
          variant: z.literal('saanseoi'),
          geometry: polygonSchema.nullable(),
        }),
      }),
    )
    .default([]),
  meta: z.object({
    apiReleaseSet: z.string(),
    apiCatalogRevision: z.string(),
    schemaVersion: z.literal('sv-division-v1'),
    inventory: z.literal('saanseoi'),
    domain: z.literal('geographic'),
    page: z.object({
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
      total: z.number().int().positive(),
    }),
  }),
})

type CatalogueState = {
  catalogueRelease: string | null
  catalogueTarget: string | null
  catalogueOffset: number
  catalogueTotal: number | null
  catalogueRevision: string | null
}
const FENCE = 'EXISTS(SELECT 1 FROM divisionRefresh WHERE id=1 AND lease=?)'
const PAGE_SIZE = 10

/** Stage one bounded catalogue page, publishing only a complete pinned inventory.
 * @param db Primary database under the refresh lease.
 * @param api Upstream connection.
 * @param release Concrete release selected by feature refresh.
 * @param statement Fenced statement factory; appends the current lease binding.
 * @returns True when this release was already complete; false after one import step.
 * @remarks Publication retains retired definitions for foreign keys; readers select catalogueRelease.
 */
export async function syncDivisionCatalogue(
  db: Pick<D1Database, 'prepare' | 'batch'>,
  api: ApiOptions,
  release: string,
  statement: (sql: string, values?: unknown[]) => D1PreparedStatement,
): Promise<boolean> {
  const state = await db
    .prepare('SELECT * FROM divisionRefresh WHERE id=1')
    .first<CatalogueState>()
  if (!state) throw new Error('DIVISION_REFRESH_STATE_MISSING')
  if (state.catalogueRelease === release) return true
  if (state.catalogueTarget !== release) {
    await db.batch([
      statement(`DELETE FROM divisionCatalogueStage WHERE ${FENCE}`),
      statement(`DELETE FROM divisionGeometryStage WHERE ${FENCE}`),
      statement(
        `UPDATE divisionRefresh SET catalogueTarget=?,catalogueOffset=0,catalogueTotal=NULL,catalogueRevision=NULL WHERE id=1 AND ${FENCE}`,
        [release],
      ),
    ])
    return false
  }
  if (state.catalogueOffset === state.catalogueTotal) {
    const count = await db
      .prepare(
        'SELECT count(*) AS total FROM divisionCatalogueStage WHERE apiReleaseSet=?',
      )
      .bind(release)
      .first<{ total: number }>()
    if (count?.total !== state.catalogueTotal)
      throw new Error('DIVISION_CATALOGUE_COUNT_MISMATCH')
    // Publish metadata, names, polygons and completeness together; old references remain valid.
    await db.batch([
      statement(`INSERT INTO divisionDefinition(id,apiReleaseSet,attributes)
        SELECT id,apiReleaseSet,attributes FROM divisionCatalogueStage WHERE ${FENCE}
        ON CONFLICT(id) DO UPDATE SET apiReleaseSet=excluded.apiReleaseSet,attributes=excluded.attributes`),
      statement(
        `DELETE FROM divisionGeometryPart WHERE divisionId IN (SELECT id FROM divisionCatalogueStage) AND ${FENCE}`,
      ),
      statement(
        `INSERT INTO divisionGeometryPart SELECT divisionId,part,geometries FROM divisionGeometryStage WHERE ${FENCE}`,
      ),
      statement(`DELETE FROM divisionGeometryStage WHERE ${FENCE}`),
      statement(
        `UPDATE divisionRefresh SET catalogueRelease=?,catalogueTarget=NULL,lastError=NULL WHERE id=1 AND ${FENCE}`,
        [release],
      ),
      statement(`DELETE FROM divisionCatalogueStage WHERE ${FENCE}`),
    ])
    return false
  }
  const page = await apiRead(
    api,
    '/divisions/v0.2',
    {
      releaseSet: release,
      ...(state.catalogueRevision ? { catalogRevision: state.catalogueRevision } : {}),
      inventory: 'saanseoi',
      domain: 'geographic',
      profile: 'full',
      locales: 'en,zh-hant,zh-hans',
      include: 'areas:saanseoi',
      'page[limit]': String(PAGE_SIZE),
      'page[offset]': String(state.catalogueOffset),
    },
    cataloguePageSchema,
  )
  const { meta } = page
  if (
    meta.apiReleaseSet !== release ||
    (state.catalogueRevision && state.catalogueRevision !== meta.apiCatalogRevision) ||
    (state.catalogueTotal !== null && state.catalogueTotal !== meta.page.total)
  )
    throw new Error('DIVISION_CATALOGUE_RELEASE_MISMATCH')
  if (
    meta.page.offset !== state.catalogueOffset ||
    meta.page.limit !== PAGE_SIZE ||
    page.data.length !== Math.min(PAGE_SIZE, meta.page.total - state.catalogueOffset)
  )
    throw new Error('DIVISION_CATALOGUE_PAGE_INCOMPLETE')
  const areas = new Map(page.included.map(area => [area.id, area]))
  const writes = page.data.flatMap(resource => {
    const membershipGeometry = (resource.relationships.areas?.data ?? []).flatMap(
      ref => {
        const area = areas.get(ref.id)
        if (!area || area.attributes.divisionId !== resource.id)
          throw new Error('DIVISION_CATALOGUE_AREA_MISSING')
        return area.attributes.geometry ? [{ geometry: area.attributes.geometry }] : []
      },
    )
    const attributes = {
      ...resource.attributes,
      names: resource.attributes.i18n,
      membershipGeometry,
      membershipBounds: bounds(membershipGeometry.map(area => area.geometry)),
      membershipGeometryExternal: false,
    }
    const parts: Polygon[][] = []
    if (new TextEncoder().encode(JSON.stringify(attributes)).byteLength > 1_500_000) {
      // Split MultiPolygons only at polygon boundaries: rings and exact coordinates remain intact.
      for (const { geometry } of membershipGeometry) {
        const polygons: Polygon[] =
          geometry.type === 'Polygon'
            ? [geometry]
            : geometry.coordinates.map(coordinates => ({
                type: 'Polygon',
                coordinates,
              }))
        for (const polygon of polygons) {
          if (
            new TextEncoder().encode(JSON.stringify([polygon])).byteLength > 1_500_000
          )
            throw new Error('DIVISION_CATALOGUE_POLYGON_TOO_LARGE')
          const last = parts.at(-1)
          if (
            last &&
            new TextEncoder().encode(JSON.stringify([...last, polygon])).byteLength <=
              1_500_000
          )
            last.push(polygon)
          else parts.push([polygon])
        }
      }
      attributes.membershipGeometry = []
      attributes.membershipGeometryExternal = true
    }
    const encoded = JSON.stringify(attributes)
    if (new TextEncoder().encode(encoded).byteLength > 1_500_000)
      throw new Error('DIVISION_CATALOGUE_METADATA_TOO_LARGE')
    // Duplicate IDs abort the page instead of disguising overlapping or unstable pagination.
    return [
      statement(
        `INSERT INTO divisionCatalogueStage(id,apiReleaseSet,attributes) SELECT ?,?,? WHERE ${FENCE}`,
        [resource.id, release, encoded],
      ),
      ...parts.map((part, index) =>
        statement(
          `INSERT INTO divisionGeometryStage(divisionId,part,geometries) SELECT ?,?,? WHERE ${FENCE}`,
          [resource.id, index, JSON.stringify(part)],
        ),
      ),
    ]
  })
  const offset = state.catalogueOffset + page.data.length
  writes.push(
    statement(
      `UPDATE divisionRefresh SET catalogueOffset=?,catalogueTotal=?,catalogueRevision=?,lastError=NULL WHERE id=1 AND ${FENCE}`,
      [offset, meta.page.total, meta.apiCatalogRevision],
    ),
  )
  await db.batch(writes)

  return false
}
