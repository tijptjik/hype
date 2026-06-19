// DRIZZLE
import { and, asc, eq, inArray, or } from 'drizzle-orm'
// DB
import { transformI18nSafely, toRelatedRecords } from '$lib/db'
import { inferPropertyDiscriminatorFromComponent } from '$lib/api/services'
import { toPropertyResponseFromRaw } from '$lib/api/services/property'
import {
  insert,
  update,
  insertMany,
  insertManyRelated,
  replaceManyRelated,
  delMany,
} from '../crud'
// SCHEMA
import {
  hub,
  organisation,
  project,
  property,
  projectProperty,
  hubProperty,
  organisationProperty,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema'
// ZOD
import { PropertyRecordCreate, PropertyRecordUpdate } from '../zod'
// I18N
import { normalizeI18nLocaleRecord } from '$lib/i18n'
// TYPES
import type { InferInsertModel, SQL } from 'drizzle-orm'
import type { Locale, Database } from '$lib/types'
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
  PropertyValueNew,
  ProjectPropertyForm,
} from '$lib/db/zod/schema/property.types'
import { syncProperties } from './layer'
import { retryBusyRead } from './sqlite'

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
//    - updatePropertyValueI18n
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - upsertProjectProperties
//    - seedDefaultInheritedPropertiesForProject
//    - syncProjectInheritedProperties
//    - syncHubProperties
//    - syncOrganisationProperties
//
// 4. COMMON
//    - propertyWithRelations (const)
//    - inferPropertyTypeFromComponent

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════
/**
 * Creates a new base property record.
 * @param db Database instance
 * @param data Data for the new property (parsed by Zod schema, e.g., PropertyRecordCreate)
 * @returns The newly created property record from DB.
 */
export const createBaseProperty = async (
  db: Database,
  data: InferInsertModel<typeof property>,
): Promise<PropertyDB> => {
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
  const normalizedI18n = normalizeI18nLocaleRecord(
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
 * Creates multiple property value records.
 * @param db Database instance
 * @param values Array of new property value data.
 * @param propertyId The ID of the parent property.
 * @returns Array of created propertyValue records.
 */
export const createPropertyValues = async (
  db: Database,
  values: PropertyValueNew[],
  propertyId: string,
): Promise<PropertyValueDB[]> => {
  const dataToInsert = values.map(val => ({
    ...val, // Spread PropertyValueNew
    propertyId: propertyId,
  })) as InferInsertModel<typeof propertyValue>[]
  return await insertMany(db, propertyValue, dataToInsert)
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
  const normalizedI18n = normalizeI18nLocaleRecord(
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
  const normalizedI18n = normalizeI18nLocaleRecord(
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
 */
export const syncPropertyValues = async (
  db: Database,
  incomingValues: PropertyValue[], // Form shape with IDs for existing, potentially new ones without
  propertyId: string,
): Promise<PropertyValueDB[]> => {
  const existingValues = await db.query.propertyValue.findMany({
    where: eq(propertyValue.propertyId, propertyId),
  })

  const existingIds = new Set(existingValues.map(v => v.id))
  const incomingMap = new Map(incomingValues.map(v => [v.id, v]))

  const idsToDelete = existingValues
    .filter(ev => !incomingMap.has(ev.id))
    .map(ev => ev.id)
  const valuesToUpdate = incomingValues.filter(iv => iv.id && existingIds.has(iv.id))
  const valuesToCreate = incomingValues.filter(iv => !iv.id || !existingIds.has(iv.id))

  // Delete removed values
  if (idsToDelete.length > 0) {
    await delMany(db, propertyValue, propertyValue.id, idsToDelete)
  }

  // Create new values
  if (valuesToCreate.length > 0) {
    const dataToInsert = valuesToCreate.map(val => ({
      ...val,
      propertyId: propertyId,
    })) as InferInsertModel<typeof propertyValue>[]
    await insertMany(db, propertyValue, dataToInsert)
  }

  // Update existing values
  await Promise.all(
    valuesToUpdate.map(async val => {
      const { i18n, ...baseValueData } = val // Exclude i18n for base propertyValue update
      await update<typeof propertyValue>(
        db,
        propertyValue,
        baseValueData,
        propertyValue.id,
        val.id,
      )
    }),
  )

  return db.query.propertyValue.findMany({
    where: eq(propertyValue.propertyId, propertyId),
  })
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
  const normalizedI18n = normalizeI18nLocaleRecord(
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
 */
export const upsertProjectProperties = async (
  db: Database,
  properties: Array<ProjectPropertyForm | Property>, // Can be a mix of submitted form rows and persisted properties
  projectId: string,
): Promise<Property[]> => {
  const existingProperties = await db.query.property.findMany({
    where: and(eq(property.scope, 'project'), eq(property.projectId, projectId)),
    with: {
      i18n: true,
      values: {
        with: {
          i18n: true,
        },
      },
    },
  })

  const existingPropsMap = new Map(existingProperties.map(p => [p.id, p]))
  const incomingPropsMap = new Map(
    properties.filter(p => (p as Property).id).map(p => [(p as Property).id, p]),
  )

  const propsToDelete = existingProperties.filter(ep => !incomingPropsMap.has(ep.id))
  const propsToCreate = properties.filter(
    p => !(p as Property).id || !existingPropsMap.has((p as Property).id),
  )
  const propsToUpdate = properties.filter(
    p => (p as Property).id && existingPropsMap.has((p as Property).id),
  ) as Property[]

  // Validate create payloads before mutating existing records.
  // This prevents destructive deletes when incoming create rows are invalid.
  const parsedCreateBasePayloads: Array<ReturnType<typeof PropertyRecordCreate.parse>> =
    []
  for (const propData of propsToCreate) {
    const {
      i18n: _i18nData,
      values: _valuesData,
      ...basePropData
    } = propData as ProjectPropertyForm
    const parsedBase = PropertyRecordCreate.parse({
      ...basePropData,
      projectId,
      hubId: null,
      scope: 'project',
      type: inferPropertyTypeFromComponent(
        (basePropData as ProjectPropertyForm).component,
      ),
      isDefaultEnabled:
        typeof (propData as ProjectPropertyForm).isDefaultEnabled === 'boolean'
          ? (propData as ProjectPropertyForm).isDefaultEnabled
          : false,
    })
    parsedCreateBasePayloads.push(parsedBase)
  }

  // Create
  const createdResults: Property[] = []
  for (const [index, propData] of propsToCreate.entries()) {
    const {
      i18n: i18nData,
      values: valuesData,
      ..._basePropData
    } = propData as ProjectPropertyForm
    const parsedBase = parsedCreateBasePayloads[index]
    if (!parsedBase) {
      throw new Error('FAILED_TO_RESOLVE_PARSED_PROPERTY_CREATE_PAYLOAD')
    }
    const newBaseProp = await createBaseProperty(db, {
      ...parsedBase,
      projectId,
      hubId: null,
      scope: 'project',
      type: inferPropertyTypeFromComponent((propData as ProjectPropertyForm).component),
      isDefaultEnabled:
        typeof (propData as ProjectPropertyForm).isDefaultEnabled === 'boolean'
          ? (propData as ProjectPropertyForm).isDefaultEnabled
          : false,
    } as InferInsertModel<typeof property>)

    const newTranslations = await createI18n(
      db,
      i18nData as Record<Locale, PropertyI18nNew>,
      newBaseProp.id,
    )

    const newPropValuesWithTranslations: PropertyValue[] = []
    if (valuesData) {
      for (const valData of valuesData as PropertyValueNew[]) {
        const { i18n: valI18nData, ...baseValData } = valData
        const newPropVal = await insert<typeof propertyValue>(db, propertyValue, {
          ...baseValData,
          propertyId: newBaseProp.id,
        } as PropertyValueNew)
        const newValTranslations =
          valI18nData && Object.keys(valI18nData).length > 0
            ? await createPropertyValueI18n(
                db,
                valI18nData as Record<Locale, PropertyValueI18nNew>,
                newPropVal.id,
              )
            : []
        newPropValuesWithTranslations.push({
          ...newPropVal,
          i18n: transformI18nSafely(newValTranslations),
        } as PropertyValue)
      }
    }
    createdResults.push({
      ...newBaseProp,
      i18n: transformI18nSafely(newTranslations),
      values: newPropValuesWithTranslations,
    } as Property)
  }

  // Update
  const updatedResults: Property[] = []
  for (const propData of propsToUpdate) {
    const { i18n: i18nData, values: valuesData, ...basePropData } = propData
    const propertyId = propData.id
    if (!propertyId) continue
    const parsedBase = PropertyRecordUpdate.parse({
      ...basePropData,
      type: inferPropertyTypeFromComponent(basePropData.component),
    }) // Validate
    const updatedBaseProp = await updateBaseProperty(
      db,
      {
        ...parsedBase,
        projectId,
        hubId: null,
        scope: 'project',
        type: inferPropertyTypeFromComponent(basePropData.component),
        isDefaultEnabled:
          typeof propData.isDefaultEnabled === 'boolean'
            ? propData.isDefaultEnabled
            : false,
      } as InferInsertModel<typeof property>,
      propertyId,
    )
    const normalizedPropertyI18n = normalizeI18nLocaleRecord(
      (i18nData || {}) as Record<string, PropertyI18nPartial>,
    )
    const updatedTranslations = await updateI18n(
      db,
      normalizedPropertyI18n as Record<Locale, PropertyI18nPartial>,
      propertyId,
    )

    const normalizedValuesData = Array.isArray(valuesData)
      ? valuesData
          .map((value, index) => ({ value, index }))
          .sort((a, b) => {
            const aRank =
              typeof a.value.rank === 'number' && Number.isFinite(a.value.rank)
                ? a.value.rank
                : Number.POSITIVE_INFINITY
            const bRank =
              typeof b.value.rank === 'number' && Number.isFinite(b.value.rank)
                ? b.value.rank
                : Number.POSITIVE_INFINITY
            if (aRank !== bRank) return aRank - bRank
            return a.index - b.index
          })
          .map(({ value }, rank) => ({ ...value, rank }))
      : []

    const syncedValues = valuesData
      ? await syncPropertyValues(db, normalizedValuesData, propertyId)
      : []

    const updatedPropValuesWithTranslations: PropertyValue[] = []
    for (const syncedVal of syncedValues) {
      // syncedVal is PropertyValueDB
      const incomingValData = valuesData?.find(v => v.id === syncedVal.id) // incomingValData is PropertyValue from input
      let valTranslations: PropertyValueI18nDB[] = []
      if (incomingValData?.i18n && Object.keys(incomingValData.i18n).length > 0) {
        try {
          valTranslations = await updatePropertyValueI18n(
            db,
            incomingValData.i18n as Record<Locale, PropertyValueI18nPartial>,
            syncedVal.id,
          )
        } catch (_e) {
          // Fallback: try to fetch existing translations if update failed
          valTranslations = await db.query.propertyValueI18n.findMany({
            where: eq(propertyValueI18n.propertyValueId, syncedVal.id),
          })
        }
      } else {
        await db
          .delete(propertyValueI18n)
          .where(eq(propertyValueI18n.propertyValueId, syncedVal.id))
        valTranslations = []
      }
      updatedPropValuesWithTranslations.push({
        ...syncedVal,
        i18n: transformI18nSafely(valTranslations),
      } as PropertyValue)
    }

    updatedResults.push({
      ...updatedBaseProp,
      i18n: transformI18nSafely(updatedTranslations),
      values: updatedPropValuesWithTranslations,
    } as Property)
  }

  // Delete stale properties after successful create/update processing.
  if (propsToDelete.length > 0) {
    await delMany(
      db,
      property,
      property.id,
      propsToDelete.map(p => p.id),
    )
  }

  return [...createdResults, ...updatedResults].sort((a, b) =>
    a.key.localeCompare(b.key),
  )
}

/**
 * Seeds inherited property assignments during project creation.
 * Pulls defaults from scoped hubs and organisation, then writes ordered assignments.
 *
 * @param db - Database handle.
 * @param params - Project id, hub scope, and optional rank offset.
 */
export const seedDefaultInheritedPropertiesForProject = async (
  db: Database,
  params: {
    projectId: string
    hubId: string | null
    startingRank?: number
  },
): Promise<void> => {
  const organisationId = await getProjectOrganisationId(db, params.projectId)
  const coreHubId = await getCoreHubId(db)
  const scopedHubIds = Array.from(
    new Set(
      [params.hubId, coreHubId].filter((hubId): hubId is string => Boolean(hubId)),
    ),
  )
  if (scopedHubIds.length === 0 && !organisationId) return

  const defaultProperties = await db.query.property.findMany({
    columns: { id: true, isDefaultEnabled: true },
    where: and(
      or(
        and(eq(property.scope, 'hub'), inArray(property.hubId, scopedHubIds)),
        organisationId
          ? and(
              eq(property.scope, 'organisation'),
              eq(property.organisationId, organisationId),
            )
          : undefined,
      ),
    ),
    orderBy: [asc(property.key)],
  })
  if (defaultProperties.length === 0) return

  await db.insert(projectProperty).values(
    defaultProperties.map((item, index) => ({
      projectId: params.projectId,
      propertyId: item.id,
      isEnabled: Boolean(item.isDefaultEnabled),
      isDefaultEnabled: Boolean(item.isDefaultEnabled),
      rank: (params.startingRank ?? 0) + index,
    })),
  )
}

/**
 * Synchronizes project inherited assignments from submitted form state,
 * then cascades resolved visibility defaults to child layers.
 *
 * @param db - Database handle.
 * @param params - Project id and submitted inherited property rows.
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

  const currentRows = await db.query.projectProperty.findMany({
    where: eq(projectProperty.projectId, params.projectId),
  })
  const currentByPropertyId = new Map(
    currentRows.map(row => [row.propertyId, row] as const),
  )
  const currentIds = new Set(currentRows.map(row => row.propertyId))
  const nextIds = new Set(submittedProjectProperties.map(row => row.id))

  const idsToDelete = currentRows
    .filter(row => !nextIds.has(row.propertyId))
    .map(row => row.propertyId)

  if (idsToDelete.length > 0) {
    await db
      .delete(projectProperty)
      .where(
        and(
          eq(projectProperty.projectId, params.projectId),
          inArray(projectProperty.propertyId, idsToDelete),
        ),
      )
  }

  const idsToCreate = submittedProjectProperties
    .filter(row => !currentIds.has(row.id))
    .map(row => row.id)

  if (idsToCreate.length > 0) {
    await db.insert(projectProperty).values(
      submittedProjectProperties
        .filter(row => idsToCreate.includes(row.id))
        .map(row => ({
          projectId: params.projectId,
          propertyId: row.id,
          isEnabled: row.isEnabled ?? true,
          isDefaultEnabled: row.isDefaultEnabled ?? false,
          rank: row.rank,
        })),
    )
  }

  await Promise.all(
    submittedProjectProperties.map(row =>
      db
        .update(projectProperty)
        .set({
          rank: row.rank,
          isEnabled:
            row.isEnabled ?? currentByPropertyId.get(row.id)?.isEnabled ?? true,
          isDefaultEnabled:
            row.isDefaultEnabled ??
            currentByPropertyId.get(row.id)?.isDefaultEnabled ??
            false,
        })
        .where(
          and(
            eq(projectProperty.projectId, params.projectId),
            eq(projectProperty.propertyId, row.id),
          ),
        ),
    ),
  )

  const resolvedProjectProperties = await listResolvedProjectProperties(
    db,
    params.projectId,
  )
  await syncProperties(db, params.projectId, resolvedProjectProperties)
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
  params: {
    hubId: string
    properties: Array<Record<string, unknown>>
  },
): Promise<Property[]> => {
  const toNullableId = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null
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
  const submittedRankById = new Map<string, number>(
    params.properties
      .filter(
        (item): item is Property =>
          typeof (item as Property).id === 'string' && (item as Property).id.length > 0,
      )
      .map(item => [item.id, toNumericRank((item as { rank?: unknown }).rank)]),
  )

  const existingProperties = await db.query.property.findMany({
    where: and(eq(property.scope, 'hub'), eq(property.hubId, params.hubId)),
    with: propertyWithRelations,
  })

  const existingById = new Map(existingProperties.map(item => [item.id, item]))
  const incomingById = new Map(
    params.properties
      .filter(
        (item): item is Property =>
          typeof (item as Property).id === 'string' && (item as Property).id.length > 0,
      )
      .map(item => [(item as Property).id, item]),
  )

  const staleIds = existingProperties
    .filter(item => !incomingById.has(item.id))
    .map(item => item.id)

  const localised = await Promise.all(
    params.properties.map(async item => {
      const isExisting =
        typeof (item as Property).id === 'string' &&
        existingById.has((item as Property).id)
      if (!isExisting) {
        const parsedCreate = PropertyRecordCreate.parse({
          ...item,
          projectId: null,
          hubId: params.hubId,
          scope: 'hub',
          type: inferPropertyTypeFromComponent((item as PropertyNew).component),
        }) as InferInsertModel<typeof property>
        const created = await createBaseProperty(db, {
          ...parsedCreate,
          projectId: null,
          hubId: toNullableId(params.hubId),
          scope: 'hub',
          type: inferPropertyTypeFromComponent((item as PropertyNew).component),
        } as InferInsertModel<typeof property>)
        await createI18n(
          db,
          (item as PropertyNew).i18n as Record<Locale, PropertyI18nNew>,
          created.id,
        )
        for (const value of (item as PropertyNew).values ?? []) {
          const { i18n: valueI18n, ...baseValue } = value
          const createdValue = await insert<typeof propertyValue>(db, propertyValue, {
            ...baseValue,
            propertyId: created.id,
          } as PropertyValueNew)
          if (valueI18n && Object.keys(valueI18n).length > 0) {
            await createPropertyValueI18n(
              db,
              valueI18n as Record<Locale, PropertyValueI18nNew>,
              createdValue.id,
            )
          }
        }
        const reloaded = await db.query.property.findFirst({
          with: propertyWithRelations,
          where: eq(property.id, created.id),
        })
        if (!reloaded) throw new Error('GLOBAL_PROPERTY_CREATE_RELOAD_FAILED')
        return toPropertyResponseFromRaw(reloaded)
      }

      const existing = item as Property
      const parsedUpdate = PropertyRecordUpdate.parse({
        ...existing,
        projectId: null,
        hubId: params.hubId,
        scope: 'hub',
        type: inferPropertyTypeFromComponent(existing.component),
      }) as Partial<InferInsertModel<typeof property>>
      const {
        id: _id,
        createdAt: _createdAt,
        modifiedAt: _modifiedAt,
        ...updateData
      } = parsedUpdate as {
        id?: string
        createdAt?: string
        modifiedAt?: string
        [key: string]: unknown
      }
      await db
        .update(property)
        .set({
          ...(updateData as Partial<InferInsertModel<typeof property>>),
          projectId: null,
          hubId: toNullableId(params.hubId),
          scope: 'hub',
          type: inferPropertyTypeFromComponent(existing.component),
        })
        .where(eq(property.id, existing.id))
      await updateI18n(
        db,
        normalizeI18nLocaleRecord(
          (existing.i18n ?? {}) as Record<string, PropertyI18nPartial>,
        ) as Record<Locale, PropertyI18nPartial>,
        existing.id,
      )
      await syncPropertyValues(db, existing.values ?? [], existing.id)
      for (const value of existing.values ?? []) {
        if (value.i18n && Object.keys(value.i18n).length > 0) {
          await updatePropertyValueI18n(
            db,
            value.i18n as Record<Locale, PropertyValueI18nPartial>,
            value.id,
          )
          continue
        }
        await db
          .delete(propertyValueI18n)
          .where(eq(propertyValueI18n.propertyValueId, value.id))
      }
      const reloaded = await db.query.property.findFirst({
        with: propertyWithRelations,
        where: eq(property.id, existing.id),
      })
      if (!reloaded) throw new Error('GLOBAL_PROPERTY_UPDATE_RELOAD_FAILED')
      return toPropertyResponseFromRaw(reloaded)
    }),
  )

  if (staleIds.length > 0) {
    await delMany(db, property, property.id, staleIds)
  }

  const ordered = localised
    .map((item, index) => ({
      id: item.id,
      rank: submittedRankById.get(item.id) ?? Number.POSITIVE_INFINITY,
      index,
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      return left.index - right.index
    })
    .map(({ id }, rank) => ({ id, rank }))
  const currentRows = await db.query.hubProperty.findMany({
    where: eq(hubProperty.hubId, params.hubId),
  })
  const currentIds = new Set(currentRows.map(row => row.propertyId))
  const nextIds = new Set(ordered.map(row => row.id))
  const idsToDelete = currentRows
    .filter(row => !nextIds.has(row.propertyId))
    .map(row => row.propertyId)

  if (idsToDelete.length > 0) {
    await db
      .delete(hubProperty)
      .where(
        and(
          eq(hubProperty.hubId, params.hubId),
          inArray(hubProperty.propertyId, idsToDelete),
        ),
      )
  }

  const idsToCreate = ordered.filter(row => !currentIds.has(row.id)).map(row => row.id)

  if (idsToCreate.length > 0) {
    await db.insert(hubProperty).values(
      ordered
        .filter(row => idsToCreate.includes(row.id))
        .map(row => ({
          hubId: params.hubId,
          propertyId: row.id,
          rank: row.rank,
        })),
    )
  }

  await Promise.all(
    ordered.map(row =>
      db
        .update(hubProperty)
        .set({ rank: row.rank })
        .where(
          and(eq(hubProperty.hubId, params.hubId), eq(hubProperty.propertyId, row.id)),
        ),
    ),
  )

  const persistedRankById = new Map(ordered.map(row => [row.id, row.rank]))
  return localised
    .map(item => ({
      ...item,
      rank: persistedRankById.get(item.id) ?? 0,
    }))
    .sort((left, right) => left.rank - right.rank)
}

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
  params: {
    organisationId: string
    properties: Array<Record<string, unknown>>
  },
): Promise<Property[]> => {
  const toNullableId = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value : null
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
  const submittedRankById = new Map<string, number>(
    params.properties
      .filter(
        (item): item is Property =>
          typeof (item as Property).id === 'string' && (item as Property).id.length > 0,
      )
      .map(item => [item.id, toNumericRank((item as { rank?: unknown }).rank)]),
  )

  const existingProperties = await db.query.property.findMany({
    where: and(
      eq(property.scope, 'organisation'),
      eq(property.organisationId, params.organisationId),
    ),
    with: propertyWithRelations,
  })

  const existingById = new Map(existingProperties.map(item => [item.id, item]))
  const incomingById = new Map(
    params.properties
      .filter(
        (item): item is Property =>
          typeof (item as Property).id === 'string' && (item as Property).id.length > 0,
      )
      .map(item => [(item as Property).id, item]),
  )

  const staleIds = existingProperties
    .filter(item => !incomingById.has(item.id))
    .map(item => item.id)

  const localised = await Promise.all(
    params.properties.map(async item => {
      const isExisting =
        typeof (item as Property).id === 'string' &&
        existingById.has((item as Property).id)
      if (!isExisting) {
        const parsedCreate = PropertyRecordCreate.parse({
          ...item,
          projectId: null,
          organisationId: params.organisationId,
          hubId: null,
          scope: 'organisation',
          type: inferPropertyTypeFromComponent((item as PropertyNew).component),
        }) as InferInsertModel<typeof property>
        const created = await createBaseProperty(db, {
          ...parsedCreate,
          projectId: null,
          organisationId: toNullableId(params.organisationId),
          hubId: null,
          scope: 'organisation',
          type: inferPropertyTypeFromComponent((item as PropertyNew).component),
        } as InferInsertModel<typeof property>)
        await createI18n(
          db,
          (item as PropertyNew).i18n as Record<Locale, PropertyI18nNew>,
          created.id,
        )
        for (const value of (item as PropertyNew).values ?? []) {
          const { i18n: valueI18n, ...baseValue } = value
          const createdValue = await insert<typeof propertyValue>(db, propertyValue, {
            ...baseValue,
            propertyId: created.id,
          } as PropertyValueNew)
          if (valueI18n && Object.keys(valueI18n).length > 0) {
            await createPropertyValueI18n(
              db,
              valueI18n as Record<Locale, PropertyValueI18nNew>,
              createdValue.id,
            )
          }
        }
        const reloaded = await db.query.property.findFirst({
          with: propertyWithRelations,
          where: eq(property.id, created.id),
        })
        if (!reloaded) throw new Error('ORGANISATION_PROPERTY_CREATE_RELOAD_FAILED')
        return toPropertyResponseFromRaw(reloaded)
      }

      const existing = item as Property
      const parsedUpdate = PropertyRecordUpdate.parse({
        ...existing,
        projectId: null,
        organisationId: params.organisationId,
        hubId: null,
        scope: 'organisation',
        type: inferPropertyTypeFromComponent(existing.component),
      }) as Partial<InferInsertModel<typeof property>>
      const {
        id: _id,
        createdAt: _createdAt,
        modifiedAt: _modifiedAt,
        ...updateData
      } = parsedUpdate as {
        id?: string
        createdAt?: string
        modifiedAt?: string
        [key: string]: unknown
      }
      await db
        .update(property)
        .set({
          ...(updateData as Partial<InferInsertModel<typeof property>>),
          projectId: null,
          organisationId: toNullableId(params.organisationId),
          hubId: null,
          scope: 'organisation',
          type: inferPropertyTypeFromComponent(existing.component),
        })
        .where(eq(property.id, existing.id))
      await updateI18n(
        db,
        normalizeI18nLocaleRecord(
          (existing.i18n ?? {}) as Record<string, PropertyI18nPartial>,
        ) as Record<Locale, PropertyI18nPartial>,
        existing.id,
      )
      await syncPropertyValues(db, existing.values ?? [], existing.id)
      for (const value of existing.values ?? []) {
        if (value.i18n && Object.keys(value.i18n).length > 0) {
          await updatePropertyValueI18n(
            db,
            value.i18n as Record<Locale, PropertyValueI18nPartial>,
            value.id,
          )
          continue
        }
        await db
          .delete(propertyValueI18n)
          .where(eq(propertyValueI18n.propertyValueId, value.id))
      }
      const reloaded = await db.query.property.findFirst({
        with: propertyWithRelations,
        where: eq(property.id, existing.id),
      })
      if (!reloaded) throw new Error('ORGANISATION_PROPERTY_UPDATE_RELOAD_FAILED')
      return toPropertyResponseFromRaw(reloaded)
    }),
  )

  if (staleIds.length > 0) {
    await delMany(db, property, property.id, staleIds)
  }

  const ordered = localised
    .map((item, index) => ({
      id: item.id,
      rank: submittedRankById.get(item.id) ?? Number.POSITIVE_INFINITY,
      index,
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      return left.index - right.index
    })
    .map(({ id }, rank) => ({ id, rank }))
  const currentRows = await db.query.organisationProperty.findMany({
    where: eq(organisationProperty.organisationId, params.organisationId),
  })
  const currentIds = new Set(currentRows.map(row => row.propertyId))
  const nextIds = new Set(ordered.map(row => row.id))
  const idsToDelete = currentRows
    .filter(row => !nextIds.has(row.propertyId))
    .map(row => row.propertyId)

  if (idsToDelete.length > 0) {
    await db
      .delete(organisationProperty)
      .where(
        and(
          eq(organisationProperty.organisationId, params.organisationId),
          inArray(organisationProperty.propertyId, idsToDelete),
        ),
      )
  }

  const idsToCreate = ordered.filter(row => !currentIds.has(row.id)).map(row => row.id)

  if (idsToCreate.length > 0) {
    await db.insert(organisationProperty).values(
      ordered
        .filter(row => idsToCreate.includes(row.id))
        .map(row => ({
          organisationId: params.organisationId,
          propertyId: row.id,
          rank: row.rank,
        })),
    )
  }

  await Promise.all(
    ordered.map(row =>
      db
        .update(organisationProperty)
        .set({ rank: row.rank })
        .where(
          and(
            eq(organisationProperty.organisationId, params.organisationId),
            eq(organisationProperty.propertyId, row.id),
          ),
        ),
    ),
  )

  const persistedRankById = new Map(ordered.map(row => [row.id, row.rank]))
  return localised
    .map(item => ({
      ...item,
      rank: persistedRankById.get(item.id) ?? 0,
    }))
    .sort((left, right) => left.rank - right.rank)
}

// ═══════════════════════
// 4. COMMON
// ═══════════════════════

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
