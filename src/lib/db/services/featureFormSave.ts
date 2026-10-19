// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
// DOMAIN
import { equalPlaceValue } from '#lib/places/baseline.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { prepareFeatureFormRelations } from './placeRelations'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  FeatureDB,
  FeatureDBPartial,
  FeatureI18nPartial,
  NewFeatureProperty,
} from '#lib/db/zod/schema/feature.types.js'

/**
 * Atomically save an unlinked Feature form without racing initial Place association.
 * @param db Request-local database.
 * @param input Authorized persisted scope, editor timestamp and validated form snapshot.
 * @returns Updated Feature or undefined if the Feature changed or became linked.
 * @remarks A server-generated token gates all child writes. Association and timestamp
 * checks are evaluated by the parent UPDATE in the same batch as relation replacement.
 * Initial linking either precedes the whole save or follows its complete new baseline.
 */
export async function saveUnlinkedFeatureForm(
  db: Database,
  input: {
    featureId: string
    projectId: string
    updatedAt: string
    data: FeatureDBPartial
    i18n: Record<string, FeatureI18nPartial>
    properties?: NewFeatureProperty[]
  },
): Promise<FeatureDB | undefined> {
  const before = await db
    .select({ geometry: feature.geometry })
    .from(feature)
    .where(and(eq(feature.id, input.featureId), eq(feature.projectId, input.projectId)))
    .get()
  if (!before) return undefined
  const formWriteToken = crypto.randomUUID()
  const { id: _id, modifiedAt: _modifiedAt, geometry, ...data } = input.data
  const geometryChanged =
    geometry !== undefined && !equalPlaceValue(geometry, before.geometry)
  const modifiedAt = new Date(
    Math.max(Date.now(), (Date.parse(input.updatedAt) || 0) + 1),
  ).toISOString()
  const guard = sql`EXISTS (SELECT 1 FROM feature WHERE id = ${input.featureId}
    AND formWriteToken = ${formWriteToken}) AND NOT EXISTS
    (SELECT 1 FROM featurePlace WHERE featureId = ${input.featureId})`
  const parent = db
    .update(feature)
    .set({
      ...data,
      modifiedAt,
      formWriteToken,
      ...(geometryChanged
        ? { geometry, spatialIndex: createFeatureSpatialIndex(geometry) }
        : {}),
    })
    .where(
      and(
        eq(feature.id, input.featureId),
        eq(feature.projectId, input.projectId),
        eq(feature.modifiedAt, input.updatedAt),
        sql`NOT EXISTS
      (SELECT 1 FROM featurePlace WHERE featureId = ${input.featureId})`,
      ),
    )
    .returning()
  // One atomic batch prevents a linker from observing new parent data with old children.
  const result = await db.batch([
    parent,
    ...prepareFeatureFormRelations(
      db,
      input.featureId,
      guard,
      input.i18n,
      input.properties,
    ),
  ])
  return (result[0] as FeatureDB[])[0]
}
