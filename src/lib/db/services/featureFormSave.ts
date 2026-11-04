// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { feature } from '../schema/feature'
// DOMAIN
import {
  LocationBrandEditSchema,
  type LocationBrandEdit,
} from '#lib/locations/brandEdit.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { getDetachedFeatureBrands } from './locationDetached'
import { prepareFeatureFormRelations } from './locationRelations'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
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
 * back the parent too; initial Location linking cannot observe an incomplete baseline.
 */
export async function createFeatureForm(
  db: Database,
  input: Parameters<typeof prepareFeatureFormCreation>[1],
): Promise<FeatureDB> {
  const plan = prepareFeatureFormCreation(db, input)
  const result = await db.batch(plan.statements)
  const created = (result[result.length - 1] as FeatureDB[])[0]
  if (!created) throw new Error('Feature creation failed')
  return created
}

/**
 * Prepares complete Feature creation for composition with dependent database writes.
 * @param db Request-local database.
 * @param input Authorized core values and validated relation snapshots.
 * @returns Stable identity and unexecuted statements ending in the Feature readback.
 * @remarks Execute all statements in one batch; preparation does not write data.
 */
export function prepareFeatureFormCreation(
  db: Database,
  input: {
    data: FeatureDBNew
    i18n: Record<string, FeatureI18nPartial>
    properties: NewFeatureProperty[]
  },
): { id: string; statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] } {
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
  return {
    id,
    statements: [
      parent,
      ...prepareFeatureFormRelations(db, id, guard, input.i18n, input.properties),
      db
        .select()
        .from(feature)
        .where(and(eq(feature.id, id), guard)),
    ],
  }
}

/**
 * Atomically save an unlinked Feature form without racing initial Location association.
 * @param db Request-local database.
 * @param input Authorized persisted scope, editor timestamp and validated form snapshot.
 * @returns Updated Feature or undefined if the Feature changed or became linked.
 * @remarks A server-generated token gates all child writes. Association and timestamp
 * checks are evaluated by the parent UPDATE in the same batch as relation replacement.
 * Initial linking either precedes the whole save or follows its complete new baseline.
 */
export async function saveUnlinkedFeatureForm(
  db: Database,
  input: Parameters<typeof prepareUnlinkedFeatureFormSave>[1],
): Promise<FeatureDB | undefined> {
  const plan = await prepareUnlinkedFeatureFormSave(db, input)
  if (!plan) return undefined
  // One atomic batch prevents a linker from observing new parent data with old children.
  const result = await db.batch(plan.statements)
  return (result[0] as FeatureDB[])[0]
    ? (result[result.length - 1] as FeatureDB[])[0]
    : undefined
}

/**
 * Prepares an optimistic Feature save for composition with dependent task writes.
 * @param db Request-local database.
 * @param input Authorized persisted identity, revision and complete form input.
 * @returns Statements and their successful-write guard, or undefined for a missing/stale parent.
 * @remarks The caller must execute all statements in one transaction; no writes occur here.
 */
export async function prepareUnlinkedFeatureFormSave(
  db: Database,
  input: {
    featureId: string
    projectId: string
    updatedAt: string
    expectedDraftState?: boolean
    data: FeatureDBPartial
    i18n: Record<string, FeatureI18nPartial>
    properties?: NewFeatureProperty[]
    locationBrandEdit?: LocationBrandEdit
    actorId?: string
  },
): Promise<
  | { guard: SQL; statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] }
  | undefined
> {
  const brandEdit = input.locationBrandEdit
    ? LocationBrandEditSchema.parse(input.locationBrandEdit)
    : undefined
  if (brandEdit) {
    if (brandEdit.choice.mode === 'inherit')
      throw new Error('Detached brands cannot inherit from a Location')
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
    geometry !== undefined && !equalLocationValue(geometry, before.geometry)
  const modifiedAt = new Date(
    Math.max(Date.now(), (Date.parse(input.updatedAt) || 0) + 1),
  ).toISOString()
  const guard = sql`EXISTS (SELECT 1 FROM feature WHERE id = ${input.featureId}
    AND formWriteToken = ${formWriteToken}) AND NOT EXISTS
    (SELECT 1 FROM featureLocation WHERE featureId = ${input.featureId})`
  const parent = db
    .update(feature)
    .set({
      ...data,
      modifiedAt,
      formWriteToken,
      ...(brandEdit
        ? {
            localLocationBrands: {
              brands:
                brandEdit.choice.mode === 'override' ? brandEdit.choice.value : [],
              revision: crypto.randomUUID(),
              actorId: input.actorId!,
            },
          }
        : {}),
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
              sql`json_extract(${feature.localLocationBrands},'$.revision')=${brandEdit.expectedRevision}`,
            ]
          : []),
        ...(input.expectedDraftState === undefined
          ? []
          : [eq(feature.isDraft, input.expectedDraftState)]),
        sql`NOT EXISTS
      (SELECT 1 FROM featureLocation WHERE featureId = ${input.featureId})`,
      ),
    )
    .returning()
  // Execute together so a linker cannot observe new parent data with old children.
  return {
    guard,
    statements: [
      parent,
      ...prepareFeatureFormRelations(
        db,
        input.featureId,
        guard,
        input.i18n,
        input.properties,
      ),
      db
        .select()
        .from(feature)
        .where(and(eq(feature.id, input.featureId), guard)),
    ],
  }
}
