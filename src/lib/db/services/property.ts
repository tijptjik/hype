// SVELTEKIT
import { error } from '@sveltejs/kit'
// IDENTITY
import { nanoid } from 'nanoid'
// DRIZZLE
import { and, asc, eq, inArray, or, not, sql, getTableColumns } from 'drizzle-orm'
import { chunkedInArray, SQL_BATCH_SIZE } from '#lib/utils/batch-query.js'
// DB
// PROPERTY CONTRACT
import { rangeDomain } from '#lib/properties/range.js'
import { toRelatedRecords } from '#lib/db/index.js'
import { inferPropertyDiscriminatorFromComponent } from '#lib/api/services/index.js'
import { toPropertyResponseFromRaw } from '#lib/api/services/property.js'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
// SCHEMA
import {
  hub,
  organisation,
  project,
  layer,
  layerProperty,
  property,
  projectProperty,
  hubProperty,
  organisationProperty,
  featureProperty,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema'
// ZOD
import { PropertyRecordCreate, PropertyRecordUpdate } from '../zod'
// I18N
import {
  propertyLocalesToForm,
  propertyContentToStorage,
} from '#lib/properties/locales.js'
// REVISIONS
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import {
  prepareOrganisationRevisionCapture,
  organisationRevisionTarget,
} from './organisationRevision.js'
import { prepareAdminResourceRevisionCapture } from './adminResourceRevision.js'
import { preparePropertyCatalogCapture } from './propertyCatalogRevision.js'
import { prepareFeaturePropertyCascadeCapture } from './featurePropertyRevision.js'
import type {
  OrganisationRevisionActor,
  OrganisationRevisionCapture,
} from './organisationRevision.js'
// TYPES
import type { InferInsertModel, SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Locale, Database } from '#lib/types.js'
import type {
  Property,
  PropertyDB,
  PropertyDBRaw,
  PropertyI18nDB,
  PropertyI18nNew,
  PropertyI18nPartial,
  PropertyNew,
  PropertyValue,
  PropertyValueDB,
  PropertyValueI18nDB,
  PropertyValueI18nNew,
  PropertyValueI18nPartial,
  ProjectPropertyForm,
} from '#lib/db/zod/schema/property.types.js'
import { retryBusyRead } from './sqlite'
import { prepareGuardedReplacement } from './guardedReplacement.js'
// TYPES

/** New value content; the write service always supplies its owning property. */
type NewPropertyValueInput = Omit<
  InferInsertModel<typeof propertyValue>,
  'propertyId'
> & {
  propertyId?: string
  i18n?: Record<string, Omit<PropertyValueI18nNew, 'propertyValueId' | 'locale'>> | null
}

/** Server-owned parent scope for an atomic property catalog save. */
type PropertyCatalogTarget = {
  scope: 'project' | 'hub' | 'organisation'
  id: string
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createBaseProperty
//    - createI18n
//    - createPropertyValues
//    - createPropertyValueI18n
//
// 2.1 CRUD :: READ
//    - listProperties
//    - getProperty
//    - listHubScopedProperties
//    - listOrganisationScopedProperties
//    - listResolvedProjectProperties
//
// 2.2 CRUD :: READ (LOOKUPS)
//    - getCoreHubId
//    - getProjectHubId
//    - getProjectOrganisationId
//
// 3.1 CRUD :: UPDATE
//    - updateBaseProperty
//    - updateI18n
//    - syncPropertyValues
//    - isMissingPropertyValueOwnership
//    - updatePropertyValueI18n
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - savePropertyCatalog (internal)
//    - preparePropertyCatalog
//    - upsertProjectProperties
//    - seedDefaultInheritedPropertiesForProject
//    - prepareDefaultInheritedProperties
//    - syncProjectInheritedProperties
//    - prepareProjectInheritedProperties
//    - syncHubProperties
//    - syncOrganisationProperties
//
// 4. COMMON
//    - propertyWithRelations (const)
//    - toCatalogRank
//    - inferPropertyTypeFromComponent

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════
/** Trusted scope for independent field creation or option appends. */
export type PropertyRevisionContext = {
  target: PropertyCatalogTarget
  actor: OrganisationRevisionActor
  guard: SQL
}

/**
 * Captures a field catalogue and invalidates its parent's complete-form edit token.
 * @param db Request database.
 * @param history Server-authorized field owner and actor.
 * @returns Atomic capture boundaries; the caller checks the scope guard before writes.
 */
async function preparePropertyOwnerCapture(
  db: Database,
  history: PropertyRevisionContext,
): Promise<OrganisationRevisionCapture> {
  const { target, actor } = history
  const parent =
    target.scope === 'organisation'
      ? organisation
      : target.scope === 'project'
        ? project
        : hub
  const own =
    target.scope === 'organisation'
      ? await prepareOrganisationRevisionCapture(
          db,
          organisationRevisionTarget(target.id),
          actor,
        )
      : await prepareAdminResourceRevisionCapture(
          db,
          target.scope,
          sql`SELECT ${target.id} AS id`,
          actor,
        )
  const catalog = await preparePropertyCatalogCapture(db, target, actor)
  // Monotonic tokens prevent a stale complete Fields form from erasing independent changes.
  const touch = db
    .update(parent)
    .set({
      modifiedAt: sql`CASE
    WHEN ${parent.modifiedAt} >= strftime('%Y-%m-%dT%H:%M:%fZ','now')
    THEN strftime('%Y-%m-%dT%H:%M:%fZ',${parent.modifiedAt},'+0.001 seconds')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END`,
    })
    .where(eq(parent.id, target.id))
  return {
    before: [...own.before, ...catalog.before],
    after: [
      touch,
      prepareRevisionCheck(db, sql`changes()=1`),
      ...catalog.after,
      ...own.after,
    ],
  }
}

/**
 * Creates a new base property record.
 * @param db Database instance
 * @param data Data for the new property (parsed by Zod schema, e.g., PropertyRecordCreate)
 * @param relations Optional translations and values saved atomically with the base.
 * @param history Trusted owner and actor for independent creation.
 * @returns The newly created property record from DB.
 * @remarks A relation failure rolls back creation, including the reserved property key.
 */
export const createBaseProperty = async (
  db: Database,
  data: InferInsertModel<typeof property>,
  relations?: {
    i18n: Record<string, Omit<PropertyI18nNew, 'propertyId' | 'locale'>>
    values?: NewPropertyValueInput[]
  },
  history?: PropertyRevisionContext,
): Promise<PropertyDB> => {
  if (relations || history) {
    relations ??= { i18n: {} }
    const id = data.id ?? nanoid(12)
    const values = (relations.values ?? []).map(({ i18n, ...value }) => ({
      ...value,
      id: value.id ?? nanoid(12),
      propertyId: id,
      i18n,
    }))
    // Allocate identities first so each translation follows its value in the same commit.
    const translations = toRelatedRecords(
      propertyContentToStorage(relations.i18n),
      'propertyId',
      id,
      'locale',
    ) as InferInsertModel<typeof propertyI18n>[]
    const writes: BatchItem<'sqlite'>[] = [
      ...prepareGuardedReplacement(
        db,
        propertyI18n,
        translations,
        propertyI18n.propertyId,
        id,
        sql`1`,
      ),
      ...prepareGuardedReplacement(
        db,
        propertyValue,
        values.map(({ i18n: _i18n, ...value }) => value),
        propertyValue.propertyId,
        id,
        sql`1`,
      ),
    ]
    for (const value of values) {
      const localized = toRelatedRecords(
        propertyContentToStorage(value.i18n ?? {}),
        'propertyValueId',
        value.id,
        'locale',
      ) as InferInsertModel<typeof propertyValueI18n>[]
      writes.push(
        ...prepareGuardedReplacement(
          db,
          propertyValueI18n,
          localized,
          propertyValueI18n.propertyValueId,
          value.id,
          sql`1`,
        ),
      )
    }
    // The base insert must succeed before any relation replacement can run.
    const capture = history
      ? await preparePropertyOwnerCapture(db, history)
      : { before: [], after: [] }
    const results = await executeRevisionBatch(db, history?.guard ?? sql`1`, [
      ...capture.before,
      db
        .insert(property)
        .values({ ...data, id })
        .returning(),
      ...writes,
      ...capture.after,
    ])
    if (!results) throw error(409, 'PROPERTY_SCOPE_OR_REVISION_CHANGED')
    const created = results[capture.before.length] as PropertyDB[]
    if (!created[0]) throw new Error('Property creation returned no row')
    return created[0] as PropertyDB
  }
  return await insert<typeof property>(db, property, data)
}

/**
 * Creates relational i18n records for a property.
 * @param db Database instance
 * @param i18n A record where keys are locales and values are the i18n data for that locale.
 * @param propertyId The ID of the parent property.
 * @returns Array of created propertyI18n records.
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyI18nNew>,
  propertyId: string,
): Promise<PropertyI18nDB[]> => {
  const normalizedI18n = propertyContentToStorage(
    i18n as Record<string, PropertyI18nNew>,
  )
  const relatedRecords = toRelatedRecords(
    normalizedI18n,
    'propertyId',
    propertyId,
    'locale',
  ) as InferInsertModel<typeof propertyI18n>[]
  return await insertManyRelated(
    db,
    propertyI18n,
    relatedRecords,
    'propertyId',
    propertyId,
  )
}

/**
 * Creates property values and their translations in one transaction.
 * @param db Database instance
 * @param values Array of new property value data.
 * @param propertyId The ID of the parent property.
 * @param history Trusted ownership and actor for independent option appends.
 * @returns Array of created propertyValue records in submission order.
 * @remarks Existing values are retained; any value or translation failure rolls back the append.
 */
export const createPropertyValues = async (
  db: Database,
  values: NewPropertyValueInput[],
  propertyId: string,
  history?:
    | PropertyRevisionContext
    | {
        organisationId: string
        hubId: string | null
        actor: OrganisationRevisionActor
      },
): Promise<PropertyValueDB[]> => {
  if (values.length === 0) return []
  // Allocate identity before batching so translations do not depend on RETURNING row order.
  const prepared = values.map(({ i18n, ...value }) => ({
    ...value, // Preserve submitted value fields while enforcing the authorized parent.
    id: value.id ?? nanoid(12),
    propertyId,
    i18n,
  }))
  const inserts: BatchItem<'sqlite'>[] = []
  const translations: BatchItem<'sqlite'>[] = []
  const batchSize = Math.max(
    1,
    Math.floor(SQL_BATCH_SIZE / Object.keys(getTableColumns(propertyValue)).length),
  )
  // Budget all value columns, including defaults, and keep every chunk in the same commit.
  for (let offset = 0; offset < prepared.length; offset += batchSize) {
    inserts.push(
      db
        .insert(propertyValue)
        .values(
          prepared
            .slice(offset, offset + batchSize)
            .map(({ i18n: _i18n, ...value }) => value),
        )
        .returning(),
    )
  }
  for (const value of prepared) {
    const localized = propertyContentToStorage(value.i18n ?? {})
    for (const [locale, translation] of Object.entries(localized)) {
      translations.push(
        db.insert(propertyValueI18n).values({
          ...translation,
          propertyValueId: value.id,
          locale,
        } as InferInsertModel<typeof propertyValueI18n>),
      )
    }
  }
  if (history) {
    const context: PropertyRevisionContext =
      'target' in history
        ? history
        : {
            target: { scope: 'organisation', id: history.organisationId },
            actor: history.actor,
            guard: sql`EXISTS(SELECT 1 FROM organisation WHERE id=${history.organisationId} AND hubId IS ${history.hubId})`,
          }
    const capture = await preparePropertyOwnerCapture(db, context)
    const owner = sql.identifier(context.target.scope + 'Id')
    const guard = sql`(${context.guard}) AND EXISTS (SELECT 1 FROM property WHERE id=${propertyId} AND scope=${context.target.scope} AND ${owner}=${context.target.id})`
    const results = await executeRevisionBatch(db, guard, [
      ...capture.before,
      ...inserts,
      ...translations,
      ...capture.after,
    ])
    if (!results) throw error(409, 'PROPERTY_SCOPE_OR_REVISION_CHANGED')
    return results
      .slice(capture.before.length, capture.before.length + inserts.length)
      .flat() as PropertyValueDB[]
  }
  const results = await db.batch([inserts[0], ...inserts.slice(1), ...translations])
  return results.slice(0, inserts.length).flat() as PropertyValueDB[]
}

/**
 * Creates internationalization records for a single property value.
 * @param db Database instance
 * @param i18n Record of i18n data for the property value.
 * @param propertyValueId The ID of the parent property value.
 * @returns Array of created propertyValueI18n records.
 */
export const createPropertyValueI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyValueI18nNew>,
  propertyValueId: string,
): Promise<PropertyValueI18nDB[]> => {
  const normalizedI18n = propertyContentToStorage(
    i18n as Record<string, PropertyValueI18nNew>,
  )
  const relatedRecords = toRelatedRecords(
    normalizedI18n,
    'propertyValueId',
    propertyValueId,
    'locale',
  ) as InferInsertModel<typeof propertyValueI18n>[]
  return await insertManyRelated(
    db,
    propertyValueI18n,
    relatedRecords,
    'propertyValueId',
    propertyValueId,
  )
}

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════
/**
 * List properties with filtering and access control
 */
export const listProperties = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<PropertyDBRaw[]> =>
  await retryBusyRead(() =>
    db.query.property.findMany({
      with: withRelations,
      where: conditions.length > 0 ? and(...conditions) : undefined,
    }),
  )

/**
 * Loads a single property row using caller-provided predicates.
 *
 * @param db - Database handle.
 * @param withRelations - Relation graph to hydrate.
 * @param conditions - SQL predicates combined with `AND`.
 * @returns Matching property row or `undefined`.
 */
export const getProperty = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
): Promise<PropertyDBRaw | undefined> => {
  const result = await retryBusyRead(() =>
    db.query.property.findFirst({
      with: withRelations,
      where: and(...conditions),
    }),
  )
  return result
}

/**
 * Lists hub-scoped global properties in effective display order.
 * Assigned rows keep persisted assignment rank; unassigned rows are appended by key.
 *
 * @param db - Database handle.
 * @param hubId - Target hub id.
 * @returns Ordered hub property payloads.
 */
export const listHubScopedProperties = async (
  db: Database,
  hubId: string,
): Promise<Property[]> => {
  const assignedRows = await retryBusyRead(() =>
    db.query.hubProperty.findMany({
      where: eq(hubProperty.hubId, hubId),
      with: {
        property: {
          with: propertyWithRelations,
        },
      },
      orderBy: [asc(hubProperty.rank)],
    }),
  )

  const assignedProperties = assignedRows
    .map((row, index) => {
      if (!row.property) return null
      return toPropertyResponseFromRaw(row.property, index)
    })
    .filter((row): row is Property => Boolean(row))

  const assignedIds = new Set(assignedProperties.map(item => item.id))
  const allRows = await retryBusyRead(() =>
    db.query.property.findMany({
      with: propertyWithRelations,
      where: and(eq(property.scope, 'hub'), eq(property.hubId, hubId)),
      orderBy: [asc(property.key)],
    }),
  )
  const scopedRows = allRows.filter(row => !assignedIds.has(row.id))

  const rankedUnassigned = scopedRows
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((row, index) =>
      toPropertyResponseFromRaw(row, assignedProperties.length + index),
    )

  return [...assignedProperties, ...rankedUnassigned]
}

/**
 * Lists organisation-scoped properties in effective display order.
 * Assigned rows keep persisted assignment rank; unassigned rows are appended.
 *
 * @param db - Database handle.
 * @param organisationId - Target organisation id.
 * @returns Ordered organisation property payloads.
 */
export const listOrganisationScopedProperties = async (
  db: Database,
  organisationId: string,
): Promise<Property[]> => {
  const assignedRows = await retryBusyRead(() =>
    db.query.organisationProperty.findMany({
      where: eq(organisationProperty.organisationId, organisationId),
      with: {
        property: {
          with: propertyWithRelations,
        },
      },
      orderBy: [asc(organisationProperty.rank)],
    }),
  )

  const assignedProperties = assignedRows
    .map((row, index) => {
      if (!row.property) return null
      return toPropertyResponseFromRaw(row.property, index)
    })
    .filter((row): row is Property => Boolean(row))

  const assignedIds = new Set(assignedProperties.map(item => item.id))
  const allRows = await retryBusyRead(() =>
    db.query.property.findMany({
      with: propertyWithRelations,
      where: and(
        eq(property.scope, 'organisation'),
        eq(property.organisationId, organisationId),
      ),
      orderBy: [asc(property.key)],
    }),
  )

  const unassignedRows = allRows.filter(row => !assignedIds.has(row.id))
  const rankedUnassigned = unassignedRows.map((row, index) =>
    toPropertyResponseFromRaw(row, assignedProperties.length + index),
  )

  return [...assignedProperties, ...rankedUnassigned]
}

/**
 * Resolves the complete project property set:
 * local project properties + inherited organisation/hub properties + assignment flags.
 *
 * @param db - Database handle.
 * @param projectId - Target project id.
 * @returns Fully resolved project property list with deterministic ranks.
 */
export const listResolvedProjectProperties = async (
  db: Database,
  projectId: string,
): Promise<Property[]> => {
  const toResolvedPropertyWithRank = (
    source: Property | PropertyDBRaw,
    rank: number,
  ): Property => {
    const sourceI18n = (source as { i18n?: unknown }).i18n
    if (Array.isArray(sourceI18n)) {
      return toPropertyResponseFromRaw(source as PropertyDBRaw, rank)
    }
    return { ...(source as Property), rank }
  }

  const [organisationId, scopedHubId, coreHubId] = await Promise.all([
    getProjectOrganisationId(db, projectId),
    getProjectHubId(db, projectId),
    getCoreHubId(db),
  ])

  const scopedHubIds = Array.from(
    new Set(
      [scopedHubId, coreHubId].filter((hubId): hubId is string => Boolean(hubId)),
    ),
  )

  const [assignments, localProperties, organisationProperties, scopedHubProperties] =
    await Promise.all([
      db.query.projectProperty.findMany({
        where: eq(projectProperty.projectId, projectId),
        columns: {
          propertyId: true,
          isEnabled: true,
          isDefaultEnabled: true,
          rank: true,
        },
        orderBy: [asc(projectProperty.rank)],
      }),
      retryBusyRead(() =>
        db.query.property.findMany({
          with: propertyWithRelations,
          where: and(eq(property.scope, 'project'), eq(property.projectId, projectId)),
          orderBy: [asc(property.key)],
        }),
      ),
      organisationId ? listOrganisationScopedProperties(db, organisationId) : [],
      scopedHubIds.length > 0
        ? Promise.all(
            scopedHubIds.map(hubId => listHubScopedProperties(db, hubId)),
          ).then(rows => rows.flat())
        : [],
    ])

  const inheritedProperties = [...organisationProperties, ...scopedHubProperties]

  const assignmentById = new Map(
    assignments.map(row => [
      row.propertyId,
      {
        rank: row.rank,
        isEnabled: row.isEnabled,
        isDefaultEnabled: row.isDefaultEnabled,
      },
    ]),
  )

  const assignedProperties = assignments
    .map(row => {
      const source =
        localProperties.find(propertyRow => propertyRow.id === row.propertyId) ??
        inheritedProperties.find(propertyRow => propertyRow.id === row.propertyId)
      if (!source) return null
      return {
        ...toResolvedPropertyWithRank(source, row.rank),
        isEnabled:
          source.scope === 'project'
            ? true
            : Boolean(row.isEnabled ?? source.isDefaultEnabled),
        isDefaultEnabled: Boolean(row.isDefaultEnabled ?? source.isDefaultEnabled),
      } as Property
    })
    .filter((item): item is Property => Boolean(item))

  const unassignedProperties = [...localProperties, ...inheritedProperties]
    .filter(propertyRow => !assignmentById.has(propertyRow.id))
    .map((propertyRow, index) => {
      const rank = assignedProperties.length + index
      return {
        ...toResolvedPropertyWithRank(propertyRow, rank),
        isEnabled:
          propertyRow.scope === 'project'
            ? true
            : Boolean(propertyRow.isDefaultEnabled),
        isDefaultEnabled: Boolean(propertyRow.isDefaultEnabled),
      } as Property
    })

  return [...assignedProperties, ...unassignedProperties]
}

// ═══════════════════════
// 2.2 CRUD :: READ (LOOKUPS)
// ═══════════════════════
/**
 * Resolves the core hub id.
 *
 * @param db - Database handle.
 * @returns Core hub id, or `null` when not configured.
 */
export const getCoreHubId = async (db: Database): Promise<string | null> => {
  const coreHub = await db.query.hub.findFirst({
    columns: { id: true },
    where: eq(hub.code, 'core'),
  })
  return coreHub?.id ?? null
}

/**
 * Resolves a project's owning hub id through organisation linkage.
 *
 * @param db - Database handle.
 * @param projectId - Target project id.
 * @returns Hub id, or `null` when the project has no hub scope.
 */
export const getProjectHubId = async (
  db: Database,
  projectId: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ hubId: organisation.hubId })
    .from(project)
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(eq(project.id, projectId))
    .limit(1)

  return row?.hubId ?? null
}

/**
 * Resolves a project's organisation id.
 *
 * @param db - Database handle.
 * @param projectId - Target project id.
 * @returns Organisation id, or `null` when missing.
 */
export const getProjectOrganisationId = async (
  db: Database,
  projectId: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ organisationId: project.organisationId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  return row?.organisationId ?? null
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════
/**
 * Updates an existing base property record.
 * @param db Database instance
 * @param data Partial data for updating the property (parsed by Zod schema, e.g., PropertyRecordUpdate)
 * @param propertyId The ID of the property to update.
 * @returns The updated property record from DB.
 */
export const updateBaseProperty = async (
  db: Database,
  data: InferInsertModel<typeof property>,
  propertyId: string,
): Promise<PropertyDB> => {
  return await update<typeof property>(db, property, data, property.id, propertyId)
}

/**
 * Updates relational i18n records for a property (replaces all existing for the property).
 * @param db Database instance
 * @param i18n A record where keys are locales and values are the i18n data for that locale.
 * @param propertyId The ID of the parent property.
 * @returns Array of updated (re-created) propertyI18n records.
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyI18nPartial>,
  propertyId: string,
): Promise<PropertyI18nDB[]> => {
  const normalizedI18n = propertyContentToStorage(
    i18n as Record<string, PropertyI18nPartial>,
  )
  const relatedRecords = toRelatedRecords(
    normalizedI18n,
    'propertyId',
    propertyId,
    'locale',
  ) as InferInsertModel<typeof propertyI18n>[]
  return await replaceManyRelated(
    db,
    propertyI18n,
    relatedRecords,
    propertyI18n.propertyId,
    propertyId,
  )
}

/**
 * Updates property values for a given property.
 * Handles creation of new values, update of existing ones, and deletion of removed ones.
 * @param db Database instance
 * @param incomingValues Array of current property value data from the form/API.
 * @param propertyId The ID of the parent property.
 * @returns Array of all current propertyValue records for the property from DB.
 * @remarks Parent linkage is server-owned. Updates and deletions recheck the target
 * property at write time rather than trusting the earlier ownership snapshot.
 * Deletions, creates, guarded updates, and readback share one atomic D1 batch.
 * @param actor Trusted editor required when option deletion changes enrolled Features.
 */
export const syncPropertyValues = async (
  db: Database,
  incomingValues: PropertyValue[], // Form shape with IDs for existing, potentially new ones without
  propertyId: string,
  actor?: OrganisationRevisionActor,
): Promise<PropertyValueDB[]> => {
  const existingValues = await db.query.propertyValue.findMany({
    where: eq(propertyValue.propertyId, propertyId),
  })

  const existingIds = new Set(existingValues.map(v => v.id))
  const incomingIds = incomingValues
    .map(value => value.id)
    .filter(id => typeof id === 'string')
  const valuesToUpdate = incomingValues.filter(iv => iv.id && existingIds.has(iv.id))
  const valuesToCreate = incomingValues.filter(iv => !iv.id || !existingIds.has(iv.id))

  // Delete removed values only while they still belong to the target property.
  // Evaluate the replacement set at write time so concurrent submissions cannot combine sets.
  const deletion = db
    .delete(propertyValue)
    .where(
      and(
        eq(propertyValue.propertyId, propertyId),
        not(chunkedInArray(propertyValue.id, incomingIds)),
      ),
    )

  // Create new values in parameter-safe chunks within the same transaction.
  const rowsPerInsert = Math.max(
    1,
    Math.floor(SQL_BATCH_SIZE / Object.keys(getTableColumns(propertyValue)).length),
  )
  const creates = []
  for (let index = 0; index < valuesToCreate.length; index += rowsPerInsert) {
    creates.push(
      db
        .insert(propertyValue)
        .values(
          valuesToCreate
            .slice(index, index + rowsPerInsert)
            .map(value => ({ ...value, propertyId })),
        ),
    )
  }

  // Update existing values without accepting a submitted parent or crossing a changed scope.
  const updates = valuesToUpdate.map(val => {
    const { i18n, ...baseValueData } = val // Exclude i18n for base propertyValue update
    return db
      .insert(propertyValue)
      .values({
        ...baseValueData,
        // The required parent lookup doubles as an in-transaction ownership assertion:
        // a moved or deleted row yields NULL, so NOT NULL aborts the entire D1 batch.
        propertyId: sql`(
        select ${propertyValue.propertyId} from ${propertyValue}
        where ${propertyValue.id} = ${val.id} and ${propertyValue.propertyId} = ${propertyId}
      )`,
      })
      .onConflictDoUpdate({
        target: propertyValue.id,
        set: { ...baseValueData, propertyId },
      })
  })

  const removed = existingValues
    .filter(value => !incomingIds.includes(value.id))
    .map(value => value.id)
  const capture = await prepareFeaturePropertyCascadeCapture(db, {
    propertyIds: [],
    optionIds: removed,
    actor,
  })
  // Fence the complete option set: a concurrent insertion must not become an unrecorded cascade.
  const snapshot = JSON.stringify(
    existingValues
      .map(({ id, propertyId, rank, value }) => ({ id, propertyId, rank, value }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  )
  const unchanged = sql`(SELECT json_group_array(json_object('id',id,'propertyId',propertyId,'rank',rank,'value',value))
    FROM (SELECT id,propertyId,rank,value FROM propertyValue WHERE propertyId=${propertyId} ORDER BY id))=${snapshot}`
  try {
    // Keep deletion, creates, guarded updates, Feature history, and readback in one transaction.
    const results = await executeRevisionBatch(db, unchanged, [
      ...capture.before,
      deletion,
      ...creates,
      ...updates,
      ...capture.after,
      db.select().from(propertyValue).where(eq(propertyValue.propertyId, propertyId)),
    ])
    if (!results) throw error(409, 'PROPERTY_VALUES_CHANGED')
    return results.at(-1) as PropertyValueDB[]
  } catch (cause) {
    if (isMissingPropertyValueOwnership(cause)) {
      throw error(404, 'PROPERTY_VALUE_NOT_FOUND')
    }
    throw cause
  }
}

/**
 * Recognizes the required-parent constraint used by guarded value updates.
 * @param cause - Error returned by SQLite, D1, or a Drizzle wrapper.
 * @returns Whether an expected update target was missing from its authorized property.
 * @remarks Match only this column's NOT NULL failure; other constraint failures retain
 * their original error and all failures have already rolled back the batch.
 */
function isMissingPropertyValueOwnership(cause: unknown): boolean {
  const visited = new Set<unknown>()
  let current = cause
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    if (
      'message' in current &&
      typeof current.message === 'string' &&
      current.message.includes('NOT NULL constraint failed: propertyValue.propertyId')
    )
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

/**
 * Updates internationalization records for a single property value (replaces all existing for that value).
 * @param db Database instance
 * @param i18n Record of i18n data for the property value.
 * @param propertyValueId The ID of the parent property value.
 * @returns Array of updated (re-created) propertyValueI18n records.
 */
export const updatePropertyValueI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyValueI18nPartial>,
  propertyValueId: string,
): Promise<PropertyValueI18nDB[]> => {
  const normalizedI18n = propertyContentToStorage(
    i18n as Record<string, PropertyValueI18nPartial>,
  )
  const relatedRecords = toRelatedRecords(
    normalizedI18n,
    'propertyValueId',
    propertyValueId,
    'locale',
  ) as InferInsertModel<typeof propertyValueI18n>[]
  return await replaceManyRelated(
    db,
    propertyValueI18n,
    relatedRecords,
    propertyValueI18n.propertyValueId,
    propertyValueId,
  )
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Upserts properties and all their related data (i18n, values, value i18n) for a project.
 * @param db Database instance
 * @param properties Array of properties to upsert.
 * @param projectId The ID of the project to upsert properties for.
 * @returns Array of upserted properties.
 * @remarks Base records, translations, values and stale-property deletions commit
 * together. Retained identities are ownership-checked again inside the transaction.
 */
export const upsertProjectProperties = async (
  db: Database,
  properties: Array<ProjectPropertyForm | Property>, // Can be a mix of submitted form rows and persisted properties
  projectId: string,
): Promise<Property[]> =>
  savePropertyCatalog(db, properties, { scope: 'project', id: projectId })

/**
 * Atomically saves one scoped catalog, its children, and hub/organisation rank links.
 * @param db - Database used by the authorized resource workflow.
 * @param properties - Complete submitted catalog for the target scope.
 * @param target - Server-owned resource scope and identifier.
 * @returns Hydrated persisted properties, in catalog rank order or local key order.
 * @remarks Callers authorize the operation; ownership is rechecked within the batch.
 */
const savePropertyCatalog = async (
  db: Database,
  properties: Array<ProjectPropertyForm | Property | PropertyNew>,
  target: PropertyCatalogTarget,
): Promise<Property[]> => {
  const prepared = await preparePropertyCatalog(db, properties, target)
  const results = await db.batch([...prepared.statements, prepared.readback])
  return prepared.toResult(results.at(-1) as PropertyDBRaw[])
}

/**
 * Prepares a scoped catalog save without committing it separately from its parent form.
 * @param db Authorized request database.
 * @param properties Complete submitted catalog.
 * @param target Server-owned catalog scope and parent identity.
 * @param actor Trusted editor for immutable catalogue history.
 * @returns Bounded writes, optional hydrated readback, and the existing response mapper.
 * @remarks Callers must execute all statements in one transaction after checking any
 * parent revision inside that same batch. Preparation performs validation and reads only.
 */
export const preparePropertyCatalog = async (
  db: Database,
  properties: Array<ProjectPropertyForm | Property | PropertyNew>,
  target: PropertyCatalogTarget,
  actor?: OrganisationRevisionActor,
): Promise<{
  statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]
  readback: BatchItem<'sqlite'>
  toResult: (rows: PropertyDBRaw[]) => Property[]
}> => {
  const ownerColumn =
    target.scope === 'project'
      ? property.projectId
      : target.scope === 'hub'
        ? property.hubId
        : property.organisationId
  const scopeFilter = and(eq(property.scope, target.scope), eq(ownerColumn, target.id))
  const existingProperties = await db.query.property.findMany({
    where: scopeFilter,
    with: { values: true },
  })
  const existingById = new Map(existingProperties.map(row => [row.id, row]))

  // Populated contracts cannot be reinterpreted by a metadata edit; migrate values explicitly.
  for (const input of properties) {
    const existing = existingById.get(input.id ?? '')
    if (
      existing &&
      ((input.dataType ?? existing.dataType) !== existing.dataType ||
        (input.cardinality ?? existing.cardinality) !== existing.cardinality ||
        input.component !== existing.component ||
        (input.dateResolution ?? existing.dateResolution) !== existing.dateResolution ||
        (input.timeMaxHour ?? existing.timeMaxHour) !== existing.timeMaxHour ||
        ((existing.dataType === 'dateRange' || existing.dataType === 'timeRange') &&
          (rangeDomain({ ...existing, ...input }).min !== rangeDomain(existing).min ||
            rangeDomain({ ...existing, ...input }).max !== rangeDomain(existing).max)))
    ) {
      const populated = await db.query.featureProperty.findFirst({
        where: eq(featureProperty.propertyId, existing.id),
      })
      if (populated) throw error(400, 'PROPERTY_CONTRACT_HAS_VALUES')
    }
  }
  // Validate every create/update before mutating existing records, avoiding destructive
  // deletes or partial saves when any submitted base payload is invalid.
  const prepared = properties.map(input => {
    const { i18n, values: submittedValues, ...base } = input
    const values =
      target.scope === 'project' ? submittedValues : (submittedValues ?? [])
    const id = input.id || nanoid(12)
    const existing = existingById.get(id)
    const serverOwnedBase = {
      ...base,
      ...(base.audience === 'internal' ? { isUserContributable: false } : {}),
      id,
      projectId: target.scope === 'project' ? target.id : null,
      hubId: target.scope === 'hub' ? target.id : null,
      organisationId: target.scope === 'organisation' ? target.id : null,
      scope: target.scope,
      type: inferPropertyTypeFromComponent(input.component),
      isDefaultEnabled:
        target.scope === 'project'
          ? Boolean(input.isDefaultEnabled)
          : input.isDefaultEnabled,
    }
    const parsed = existing
      ? PropertyRecordUpdate.parse(serverOwnedBase)
      : PropertyRecordCreate.parse(serverOwnedBase)
    const normalizedValues = Array.isArray(values)
      ? values
          .map((value, index) => ({ value, index }))
          .sort((a, b) => {
            const left =
              typeof a.value.rank === 'number' && Number.isFinite(a.value.rank)
                ? a.value.rank
                : Number.POSITIVE_INFINITY
            const right =
              typeof b.value.rank === 'number' && Number.isFinite(b.value.rank)
                ? b.value.rank
                : Number.POSITIVE_INFINITY
            return left === right ? a.index - b.index : left - right
          })
          // Allocate identity before persistence so ID-less values retain their translations.
          .map(({ value }, rank) => ({ ...value, id: value.id || nanoid(12), rank }))
      : undefined
    if (
      normalizedValues &&
      new Set(normalizedValues.map(value => value.id)).size !== normalizedValues.length
    ) {
      throw error(400, 'DUPLICATE_PROPERTY_VALUE_ID')
    }
    return {
      id,
      rank: toCatalogRank('rank' in input ? input.rank : undefined),
      existing,
      parsed,
      values: normalizedValues,
      i18n: propertyContentToStorage(
        (i18n ?? {}) as Record<string, PropertyI18nPartial>,
      ),
    }
  })
  const ids = prepared.map(row => row.id)
  if (new Set(ids).size !== ids.length) throw error(400, 'DUPLICATE_PROPERTY_ID')

  // Recheck ownership inside the batch before touching parents or their children.
  // CASE short-circuits; malformed JSON aborts the transaction when a retained row moved.
  const retainedIds = prepared.filter(row => row.existing).map(row => row.id)
  const ownership = db
    .select({
      valid: sql<number>`case when count(*) = ${retainedIds.length} then 1
      else json('PROPERTY_NOT_FOUND') end`,
    })
    .from(property)
    .where(and(scopeFilter, chunkedInArray(property.id, retainedIds)))
  const writes: BatchItem<'sqlite'>[] = []
  for (const row of prepared) {
    // Create or update the base record without replacing its identity or dependent links.
    if (row.existing) {
      // Identity and timestamps are server-owned, even when a hydrated record was submitted.
      const {
        id: _id,
        createdAt: _createdAt,
        modifiedAt: _modifiedAt,
        ...updateData
      } = row.parsed
      writes.push(
        db
          .update(property)
          .set(updateData)
          .where(and(eq(property.id, row.id), scopeFilter)),
      )
    } else {
      writes.push(
        db.insert(property).values(row.parsed as InferInsertModel<typeof property>),
      )
    }

    // Replace property translations in the same transaction as their base record.
    writes.push(db.delete(propertyI18n).where(eq(propertyI18n.propertyId, row.id)))
    for (const [locale, translation] of Object.entries(row.i18n)) {
      if (typeof translation.label !== 'string')
        throw error(400, 'PROPERTY_LABEL_REQUIRED')
      writes.push(
        db.insert(propertyI18n).values({
          ...translation,
          label: translation.label,
          propertyId: row.id,
          locale,
        }),
      )
    }
    if (!row.values) continue

    const existingValueIds = new Set(row.existing?.values.map(value => value.id) ?? [])
    const retainedValueIds = row.values
      .filter(value => existingValueIds.has(value.id))
      .map(value => value.id)
    writes.push(
      db
        .select({
          valid: sql<number>`case when count(*) = ${retainedValueIds.length} then 1
        else json('PROPERTY_VALUE_NOT_FOUND') end`,
        })
        .from(propertyValue)
        .where(
          and(
            eq(propertyValue.propertyId, row.id),
            chunkedInArray(propertyValue.id, retainedValueIds),
          ),
        ),
    )
    // Removed values cascade to translations and feature links only if the entire save succeeds.
    writes.push(
      db.delete(propertyValue).where(
        and(
          eq(propertyValue.propertyId, row.id),
          not(
            chunkedInArray(
              propertyValue.id,
              row.values.map(value => value.id),
            ),
          ),
        ),
      ),
    )
    for (const value of row.values) {
      const { i18n, ...baseValue } = value
      if (existingValueIds.has(value.id)) {
        writes.push(
          db
            .update(propertyValue)
            .set({ ...baseValue, propertyId: row.id })
            .where(
              and(eq(propertyValue.id, value.id), eq(propertyValue.propertyId, row.id)),
            ),
        )
      } else {
        writes.push(
          db.insert(propertyValue).values({ ...baseValue, propertyId: row.id }),
        )
      }
      // Do not fall back to old translations on a failed write: fail and roll back the whole save.
      writes.push(
        db
          .delete(propertyValueI18n)
          .where(eq(propertyValueI18n.propertyValueId, value.id)),
      )
      const translations = propertyContentToStorage(
        (i18n ?? {}) as Record<string, PropertyValueI18nPartial>,
      )
      for (const [locale, translation] of Object.entries(translations)) {
        if (typeof translation.value !== 'string')
          throw error(400, 'PROPERTY_VALUE_TRANSLATION_REQUIRED')
        writes.push(
          db.insert(propertyValueI18n).values({
            ...translation,
            value: translation.value,
            propertyValueId: value.id,
            locale,
          }),
        )
      }
    }
  }

  // Rank-link replacement belongs to the same transaction as the catalog and its children.
  const ordered = prepared
    .map((row, index) => ({ id: row.id, rank: row.rank, index }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
  const ranks = new Map(ordered.map((row, rank) => [row.id, rank]))
  if (target.scope === 'hub') {
    writes.push(db.delete(hubProperty).where(eq(hubProperty.hubId, target.id)))
    for (const [propertyId, rank] of ranks) {
      writes.push(db.insert(hubProperty).values({ hubId: target.id, propertyId, rank }))
    }
  } else if (target.scope === 'organisation') {
    writes.push(
      db
        .delete(organisationProperty)
        .where(eq(organisationProperty.organisationId, target.id)),
    )
    for (const [propertyId, rank] of ranks) {
      writes.push(
        db
          .insert(organisationProperty)
          .values({ organisationId: target.id, propertyId, rank }),
      )
    }
  }

  // Delete omitted public fields before inserts so replacements can reuse their keys.
  // The enclosing batch restores these rows and their children if any later write fails.
  const deletion = db
    .delete(property)
    .where(
      and(
        scopeFilter,
        eq(property.audience, 'public'),
        not(chunkedInArray(property.id, ids)),
      ),
    )
  const readback = db.query.property.findMany({
    where: scopeFilter,
    with: { i18n: true, values: { with: { i18n: true } } },
    orderBy: [asc(property.key)],
  })
  const capture = actor
    ? await preparePropertyCatalogCapture(db, target, actor)
    : { before: [], after: [] }
  const ownerName = sql.identifier(target.scope + 'Id')
  const deleted = sql`SELECT id FROM property WHERE scope=${target.scope} AND ${ownerName}=${target.id} AND audience='public' AND id NOT IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
  // Capture every assignment removed by FK cascades, including cross-owner shared fields.
  const affectedOrg = actor
    ? await prepareOrganisationRevisionCapture(
        db,
        sql`SELECT DISTINCT organisationId AS id FROM organisationProperty WHERE propertyId IN (${deleted})`,
        actor,
        { touchModifiedAt: true },
      )
    : { before: [], after: [] }
  const affected = []
  for (const resource of ['project', 'layer', 'hub'] as const) {
    affected.push(
      await prepareAdminResourceRevisionCapture(
        db,
        resource,
        sql`SELECT DISTINCT ${sql.identifier(resource + 'Id')} AS id FROM ${sql.identifier(resource + 'Property')} WHERE propertyId IN (${deleted})`,
        actor,
        { touchModifiedAt: true },
      ),
    )
  }
  const removedPropertyIds = existingProperties
    .filter(row => row.audience === 'public' && !ids.includes(row.id))
    .map(row => row.id)
  const removedOptionIds = prepared.flatMap(row =>
    row.values
      ? (row.existing?.values ?? [])
          .filter(value => !row.values!.some(next => next.id === value.id))
          .map(value => value.id)
      : [],
  )
  const affectedFeatures = await prepareFeaturePropertyCascadeCapture(db, {
    propertyIds: removedPropertyIds,
    optionIds: removedOptionIds,
    actor,
  })
  // Enclosing forms own overlapping captures; nested capture scopes retain their original preimage.
  return {
    statements: [
      ownership,
      ...affectedOrg.before,
      ...affected.flatMap(row => row.before),
      ...capture.before,
      ...affectedFeatures.before,
      deletion,
      ...writes,
      ...affectedFeatures.after,
      ...capture.after,
      ...affected.toReversed().flatMap(row => row.after),
      ...affectedOrg.after,
    ],
    readback,
    toResult: (rows: PropertyDBRaw[]): Property[] => {
      if (target.scope !== 'project') {
        return rows
          .map(row => toPropertyResponseFromRaw(row, ranks.get(row.id) ?? 0))
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      }
      return rows.map(row => ({
        ...row,
        i18n: propertyLocalesToForm(row.i18n),
        values:
          row.values?.map(value => ({
            ...value,
            i18n: propertyLocalesToForm(value.i18n),
          })) ?? [],
      })) as Property[]
    },
  }
}

/**
 * Seeds inherited property assignments during project creation.
 * Pulls defaults from scoped hubs and organisation, then writes ordered assignments.
 *
 * @param db - Database handle.
 * @param params - Project id, hub scope, and optional rank offset.
 * @returns Nothing after all missing inherited assignments are inserted atomically.
 * @remarks Existing assignments are preserved, including explicit disabled flags.
 * New ranks follow both the requested offset and the last persisted assignment.
 */
export const seedDefaultInheritedPropertiesForProject = async (
  db: Database,
  params: {
    projectId: string
    hubId: string | null
    startingRank?: number
  },
): Promise<void> => {
  await db.batch([prepareDefaultInheritedProperties(db, params)])
}

/**
 * Prepares default assignments for a project without committing separately from creation.
 * @param db Request database.
 * @param params Project identity, inherited hub scope and rank offset.
 * @returns A bounded insert statement preserving existing explicit assignments.
 */
export const prepareDefaultInheritedProperties = (
  db: Database,
  params: Parameters<typeof seedDefaultInheritedPropertiesForProject>[1],
): BatchItem<'sqlite'> => {
  const organisationIds = db
    .select({ id: project.organisationId })
    .from(project)
    .where(eq(project.id, params.projectId))
  const coreHubId = db
    .select({ id: hub.id })
    .from(hub)
    .where(eq(hub.code, 'core'))
    .limit(1)
  const assignedIds = db
    .select({ id: projectProperty.propertyId })
    .from(projectProperty)
    .where(eq(projectProperty.projectId, params.projectId))
  const nextRank = db
    .select({
      rank: sql<number>`coalesce(max(${projectProperty.rank}) + 1, 0)`,
    })
    .from(projectProperty)
    .where(eq(projectProperty.projectId, params.projectId))

  // Select only missing defaults at write time; explicit choices and ranks remain untouched.
  // INSERT SELECT has a fixed parameter count regardless of the inherited catalog size.
  return db
    .insert(projectProperty)
    .select(
      db
        .select({
          projectId: sql<string>`${params.projectId}`.as('projectId'),
          propertyId: property.id,
          isEnabled: property.isDefaultEnabled,
          isDefaultEnabled: property.isDefaultEnabled,
          rank: sql<number>`max(${params.startingRank ?? 0}, (${nextRank})) +
        row_number() over (order by ${property.key}, ${property.id}) - 1`.as('rank'),
        })
        .from(property)
        .where(
          and(
            not(inArray(property.id, assignedIds)),
            or(
              and(
                eq(property.scope, 'hub'),
                or(
                  params.hubId ? eq(property.hubId, params.hubId) : undefined,
                  inArray(property.hubId, coreHubId),
                ),
              ),
              and(
                eq(property.scope, 'organisation'),
                inArray(property.organisationId, organisationIds),
              ),
            ),
          ),
        ),
    )
    .onConflictDoNothing({
      target: [projectProperty.projectId, projectProperty.propertyId],
    })
}

/**
 * Synchronizes project inherited assignments from submitted form state,
 * then cascades resolved visibility defaults to child layers.
 *
 * @param db - Database handle.
 * @param params - Project id and submitted inherited property rows.
 * @returns Nothing after project assignments and child-layer links commit together.
 * @remarks The caller authorizes the project and property selection. Omitted flags
 * retain their live values; existing child-layer visibility is not overwritten.
 */
export const syncProjectInheritedProperties = async (
  db: Database,
  params: {
    projectId: string
    properties: Array<
      Pick<Property, 'id' | 'scope'> & {
        isEnabled?: boolean
        isDefaultEnabled?: boolean
        rank?: unknown
      }
    >
  },
): Promise<void> => {
  await db.batch(prepareProjectInheritedProperties(db, params))
}

/**
 * Prepares inherited assignments and child-layer links for an enclosing project transaction.
 * @param db Request database.
 * @param params Project identity and authorized assignment collection.
 * @returns Ordered bounded statements that preserve live omitted flags and layer visibility.
 * @remarks Execute after the parent move so catalog scope uses the destination organisation.
 */
export const prepareProjectInheritedProperties = (
  db: Database,
  params: Parameters<typeof syncProjectInheritedProperties>[1],
): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] => {
  const toNumericRank = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value)
    }
    return Number.POSITIVE_INFINITY
  }

  const submittedProjectProperties = params.properties
    .filter(
      (
        item,
      ): item is Pick<Property, 'id' | 'scope'> & {
        id: string
        isEnabled?: boolean
        isDefaultEnabled?: boolean
        rank?: unknown
      } => typeof item.id === 'string' && item.id.length > 0,
    )
    .map((item, index) => ({
      ...item,
      inputIndex: index,
      submittedRank: toNumericRank(item.rank),
    }))
    .sort((left, right) => {
      if (left.submittedRank !== right.submittedRank) {
        return left.submittedRank - right.submittedRank
      }
      return left.inputIndex - right.inputIndex
    })
    .map((item, rank) => ({
      id: item.id,
      scope: item.scope,
      isEnabled: item.isEnabled,
      isDefaultEnabled: item.isDefaultEnabled,
      rank,
    }))

  // Preserve omitted flags from live rows and keep every assignment write in the same batch.
  const detachAssignments = db.delete(projectProperty).where(
    and(
      eq(projectProperty.projectId, params.projectId),
      not(
        chunkedInArray(
          projectProperty.propertyId,
          submittedProjectProperties.map(row => row.id),
        ),
      ),
    ),
  )
  const assignments = submittedProjectProperties.map(row =>
    db
      .insert(projectProperty)
      .values({
        projectId: params.projectId,
        propertyId: row.id,
        isEnabled: row.isEnabled ?? true,
        isDefaultEnabled: row.isDefaultEnabled ?? false,
        rank: row.rank,
      })
      .onConflictDoUpdate({
        target: [projectProperty.projectId, projectProperty.propertyId],
        set: {
          rank: row.rank,
          isEnabled: row.isEnabled ?? sql`${projectProperty.isEnabled}`,
          isDefaultEnabled:
            row.isDefaultEnabled ?? sql`${projectProperty.isDefaultEnabled}`,
        },
      }),
  )

  // Match the read resolver's local, organisation, scoped-hub and core-hub catalogs.
  // Resolve these scopes at execution time so the cascade uses the assignments just written.
  const organisationIds = db
    .select({ id: project.organisationId })
    .from(project)
    .where(eq(project.id, params.projectId))
  const scopedHubIds = db
    .select({ id: organisation.hubId })
    .from(organisation)
    .where(inArray(organisation.id, organisationIds))
  const coreHubId = db
    .select({ id: hub.id })
    .from(hub)
    .where(eq(hub.code, 'core'))
    .limit(1)
  const effectiveHubIds = db
    .select({ id: hub.id })
    .from(hub)
    .where(or(inArray(hub.id, scopedHubIds), inArray(hub.id, coreHubId)))
  const organisationCatalogIds = db
    .select({ id: organisationProperty.propertyId })
    .from(organisationProperty)
    .where(inArray(organisationProperty.organisationId, organisationIds))
  const hubCatalogIds = db
    .select({ id: hubProperty.propertyId })
    .from(hubProperty)
    .where(inArray(hubProperty.hubId, effectiveHubIds))
  const enabledProperties = db
    .select({
      id: property.id,
      defaultEnabled:
        sql<boolean>`coalesce(${projectProperty.isDefaultEnabled}, ${property.isDefaultEnabled}, 0)`.as(
          'defaultEnabled',
        ),
    })
    .from(property)
    .leftJoin(
      projectProperty,
      and(
        eq(projectProperty.propertyId, property.id),
        eq(projectProperty.projectId, params.projectId),
      ),
    )
    .where(
      and(
        or(
          and(eq(property.scope, 'project'), eq(property.projectId, params.projectId)),
          and(
            eq(property.scope, 'organisation'),
            inArray(property.organisationId, organisationIds),
          ),
          and(eq(property.scope, 'hub'), inArray(property.hubId, effectiveHubIds)),
          inArray(property.id, organisationCatalogIds),
          inArray(property.id, hubCatalogIds),
        ),
        or(
          eq(property.scope, 'project'),
          sql`coalesce(${projectProperty.isEnabled}, ${property.isDefaultEnabled}, 0) = 1`,
        ),
      ),
    )
    .as('enabledProjectProperties')
  const layerIds = db
    .select({ id: layer.id })
    .from(layer)
    .where(eq(layer.projectId, params.projectId))
  const detachLayerLinks = db
    .delete(layerProperty)
    .where(
      and(
        inArray(layerProperty.layerId, layerIds),
        not(
          inArray(
            layerProperty.propertyId,
            db.select({ id: enabledProperties.id }).from(enabledProperties),
          ),
        ),
      ),
    )
  const insertLayerLinks = db
    .insert(layerProperty)
    .select(
      db
        .select({
          layerId: layer.id,
          propertyId: enabledProperties.id,
          isVisible: enabledProperties.defaultEnabled,
          isUserContributable: enabledProperties.defaultEnabled,
        })
        .from(layer)
        .innerJoin(enabledProperties, sql`true`)
        .where(eq(layer.projectId, params.projectId)),
    )
    .onConflictDoNothing({ target: [layerProperty.layerId, layerProperty.propertyId] })

  // Child-layer failures must also restore the parent assignments and their ordering.
  return [detachAssignments, ...assignments, detachLayerLinks, insertLayerLinks]
}

/**
 * Synchronizes a hub's global property catalog and assignment ranks.
 * Handles create/update/delete of properties, value translations, and hub rank links.
 *
 * @param db - Database handle.
 * @param params - Hub id and submitted property collection.
 * @returns Persisted ordered property list.
 */
export const syncHubProperties = async (
  db: Database,
  params: { hubId: string; properties: Array<Record<string, unknown>> },
): Promise<Property[]> =>
  savePropertyCatalog(db, params.properties as Array<Property | PropertyNew>, {
    scope: 'hub',
    id: params.hubId,
  })

/**
 * Synchronizes an organisation's scoped property catalog and assignment ranks.
 * Handles create/update/delete of properties, value translations, and organisation rank links.
 *
 * @param db - Database handle.
 * @param params - Organisation id and submitted property collection.
 * @returns Persisted ordered property list.
 */
export const syncOrganisationProperties = async (
  db: Database,
  params: { organisationId: string; properties: Array<Record<string, unknown>> },
): Promise<Property[]> =>
  savePropertyCatalog(db, params.properties as Array<Property | PropertyNew>, {
    scope: 'organisation',
    id: params.organisationId,
  })

// ═══════════════════════
// 4. COMMON
// ═══════════════════════

/**
 * Normalizes supplied catalog ranks, appending unranked rows in input order.
 * @param value - Numeric or numeric-string rank from the submitted catalog.
 * @returns Finite rank, or positive infinity for an unspecified/invalid rank.
 */
const toCatalogRank = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return Number.POSITIVE_INFINITY
}

/**
 * Relation graph used when resolving property + value translations in one query.
 */
const propertyWithRelations = {
  i18n: true,
  values: {
    with: {
      i18n: true,
    },
  },
} as const

/**
 * Resolves the persisted property discriminator from submitted component identity.
 * Defaults to `specifier` when component cannot be mapped.
 */
const inferPropertyTypeFromComponent = (
  component: unknown,
): 'classifier' | 'specifier' => {
  return inferPropertyDiscriminatorFromComponent(component) ?? 'specifier'
}
