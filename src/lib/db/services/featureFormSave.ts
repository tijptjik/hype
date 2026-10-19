// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlaceDetached } from '../schema/place'
// DOMAIN
import { PlaceBrandEditSchema, type PlaceBrandEdit } from '#lib/places/brandEdit.js'
import { equalPlaceValue } from '#lib/places/baseline.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { getDetachedFeatureBrands } from './placeDetached'
import { prepareFeatureFormRelations } from './placeRelations'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  FeatureDB,
  FeatureDBNew,
  FeatureDBPartial,
  FeatureI18nPartial,
  NewFeatureProperty,
} from '#lib/db/zod/schema/feature.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ATOMIC CREATION
// 2. CONDITIONAL UPDATE
// ---

/**
 * Create a complete Feature and its relations as one visible database state.
 * @param db Request-local database.
 * @param input Authorized core values and validated translations/property snapshots.
 * @returns The inserted Feature after all relations commit.
 * @remarks Callers validate phone properties before calling. Any child failure rolls
 * back the parent too; initial Place linking cannot observe an incomplete baseline.
 */
export async function createFeatureForm(
  db: Database,
  input: {
    data: FeatureDBNew
    i18n: Record<string, FeatureI18nPartial>
    properties: NewFeatureProperty[]
  },
): Promise<FeatureDB> {
  const id = input.data.id || nanoid(12)
  const formWriteToken = crypto.randomUUID()
  const parent = db
    .insert(feature)
    .values({
      ...input.data,
      id,
      formWriteToken,
      spatialIndex: createFeatureSpatialIndex(input.data.geometry),
      addressMeta: input.data.addressMeta ?? {},
      isPublished: input.data.isPublished ?? false,
    })
    .returning()
  const guard = sql`EXISTS (SELECT 1 FROM feature WHERE id = ${id} AND formWriteToken = ${formWriteToken})`
  const result = await db.batch([
    parent,
    ...prepareFeatureFormRelations(db, id, guard, input.i18n, input.properties),
  ])
  const created = (result[0] as FeatureDB[])[0]
  if (!created) throw new Error('Feature creation failed')
  return created
}

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
    expectedDraftState?: boolean
    data: FeatureDBPartial
    i18n: Record<string, FeatureI18nPartial>
    properties?: NewFeatureProperty[]
    placeBrandEdit?: PlaceBrandEdit
    actorId?: string
  },
): Promise<FeatureDB | undefined> {
  const brandEdit = input.placeBrandEdit
    ? PlaceBrandEditSchema.parse(input.placeBrandEdit)
    : undefined
  if (brandEdit) {
    if (brandEdit.choice.mode === 'inherit')
      throw new Error('Detached brands cannot inherit from a Place')
    if (!input.actorId) throw new Error('Brand editor actor is required')
    const detached = await getDetachedFeatureBrands(
      db,
      input.featureId,
      input.projectId,
    )
    if (!detached || detached.revision !== brandEdit.expectedRevision) return undefined
  }
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
        ...(brandEdit
          ? [
              sql`EXISTS (SELECT 1 FROM featurePlaceDetached
          WHERE featureId=${input.featureId} AND revision=${brandEdit.expectedRevision})`,
            ]
          : []),
        ...(input.expectedDraftState === undefined
          ? []
          : [eq(feature.isDraft, input.expectedDraftState)]),
        sql`NOT EXISTS
      (SELECT 1 FROM featurePlace WHERE featureId = ${input.featureId})`,
      ),
    )
    .returning()
  // One atomic batch prevents a linker from observing new parent data with old children.
  const result = await db.batch([
    parent,
    ...(brandEdit
      ? [
          db
            .update(featurePlaceDetached)
            .set({
              brands:
                brandEdit.choice.mode === 'override' ? brandEdit.choice.value : [],
              revision: crypto.randomUUID(),
              actorId: input.actorId!,
            })
            .where(sql`${featurePlaceDetached.featureId}=${input.featureId}
      AND ${featurePlaceDetached.revision}=${brandEdit.expectedRevision} AND ${guard}`),
        ]
      : []),
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
