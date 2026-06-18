// ORM
import { drizzle } from 'drizzle-orm/d1'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  not,
  or,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
// I18N
import { toLocaleKey, toLocaleKebab } from '$lib/i18n'
// SCHEMA
import * as schema from './schema'
// ENUMS
import { supportedLocaleKeys, HierarchicalResource } from '../enums'
// TYPES
import type {
  Field,
  Resource,
  ResourceDB,
  ResourceType,
  Locale,
  LocaleKey,
  Database,
  ResourceConfig,
  ResourceHierarchy,
  LocaleBundle,
} from '../types'
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CONFIG
//    - resourceConfig (hierarchy configuration)
//
// 2. DATABASE :: CLIENT
//    - client
//
// 3. UTILS :: HIERARCHY
//    - getSlicedHierarchy
//
// 4. UTILS :: TABLE RELATIONS
//    - getTable
//    - getForeignKey
//    - getReverseForeignKey
//
// 5. SUBQUERIES
//    - applyPrismConstraints
//    - createLevelQuery
//    - createJsonPathCondition
//
// 6. TRANSFORMATIONS :: LOCALE
//    - toLocaleMap
//    - isTransformedLocaleMap
//    - transformI18nSafely
//
// 7. TRANSFORMATIONS :: RECORDS
//    - toRelatedRecords
//
// 8. ORDERING
//    - toOrderByWithLocalizedFields
//
// 9. VALIDATION :: FIELDS
//    - isFieldUnique
//    - isFieldChanged
//
// 10. VALIDATION :: TABLES
//     - validateTableColumns
//

// ═══════════════════════
// 1. CONFIG
// ═══════════════════════

export const resourceConfig: Record<HierarchicalResource, ResourceConfig> = {
  feature: {
    name: 'feature',
    table: schema.feature,
    parentName: 'layer',
    parentTable: schema.layer,
    keyToParent: 'layerId',
    keyToSelf: 'featureId',
    depth: 3,
  },
  task: {
    name: 'task',
    table: schema.task,
    parentName: 'project',
    parentTable: schema.project,
    keyToParent: 'projectId',
    keyToSelf: 'taskId',
    depth: 2,
  },
  layer: {
    name: 'layer',
    table: schema.layer,
    parentName: 'project',
    parentTable: schema.project,
    keyToParent: 'projectId',
    keyToSelf: 'layerId',
    depth: 2,
  },
  project: {
    name: 'project',
    table: schema.project,
    parentName: 'organisation',
    parentTable: schema.organisation,
    keyToParent: 'organisationId',
    keyToSelf: 'projectId',
    depth: 1,
  },
  organisation: {
    name: 'organisation',
    table: schema.organisation,
    parentName: null,
    parentTable: null,
    keyToParent: null,
    keyToSelf: 'organisationId',
    depth: 0,
  },
}

// ═══════════════════════
// 2. DATABASE :: CLIENT
// ═══════════════════════

const client = (
  database: MiniflareD1Database,
  enableLogger: boolean = false,
): DrizzleD1Database<typeof schema> => {
  return drizzle(database, {
    schema,
    logger: enableLogger,
  })
}

// ═══════════════════════
// 3. UTILS :: HIERARCHY
// ═══════════════════════

/**
 * Get the sliced hierarchy for a given resource.
 * @param resource - The hierarchical resource.
 * @returns The sliced resource hierarchy.
 */
export const getSlicedHierarchy = (
  resource: HierarchicalResource,
): ResourceHierarchy => {
  const config = resourceConfig[resource]
  if (!config) {
    throw new Error(`Unknown resource: ${resource}`)
  }

  const resourceHierarchyDefault: ResourceHierarchy = [
    resourceConfig.feature,
    resourceConfig.layer,
    resourceConfig.project,
    resourceConfig.organisation,
  ]

  const resourceHierarchyTask: ResourceHierarchy = [
    resourceConfig.task,
    resourceConfig.project,
    resourceConfig.organisation,
  ]

  // Custom hierarchy for tasks as per src/lib/db/services/task.ts
  if (resource === HierarchicalResource.task) {
    return resourceHierarchyTask
  }
  // Default slicing for other resources.
  // The slice should be from the end of the default hierarchy array,
  // taking 'depth + 1' elements to include the current resource and its parents.
  return resourceHierarchyDefault.slice(
    resourceHierarchyDefault.length - (config.depth + 1),
  )
}

// ═══════════════════════
// 4. UTILS :: TABLE RELATIONS
// ═══════════════════════

// Update getTable function
const getTable = <T extends SQLiteTableWithColumns<any>>(
  slicedHierarchy: ResourceConfig[],
  index: number,
): T => slicedHierarchy[index].table as T

// Update getForeignKey function
const getForeignKey = (slicedHierarchy: ResourceConfig[], index: number): string =>
  slicedHierarchy[index].keyToParent as string

// ═══════════════════════
// 5. SUBQUERIES
// ═══════════════════════

/**
 * Creates a subquery for a specific level in the resource hierarchy,
 * considering prism constraints.
 *
 * @param db - The Drizzle instance.
 * @param slicedHierarchy - The portion of the resource hierarchy relevant to the current query.
 * @param levelUp - The current level in the hierarchy being processed (0 is the target resource).
 * @param prisms - An object containing prism filters, where keys are resource names and values are arrays of IDs/codes.
 * @returns A Drizzle subquery.
 */
const createLevelQuery = (
  db: any,
  slicedHierarchy: ResourceHierarchy,
  levelUp: number,
  prisms: any,
) => {
  const conditions = []
  const baseQuery = db
    .select({ id: getTable(slicedHierarchy, levelUp).id })
    .from(getTable(slicedHierarchy, levelUp))

  if (levelUp > 0) {
    conditions.push(
      inArray(
        getTable(slicedHierarchy, levelUp).id,
        prisms[slicedHierarchy[levelUp].name] || [],
      ),
    )
  }

  if (levelUp > 1) {
    conditions.push(
      not(
        exists(
          db
            .select({ id: getTable(slicedHierarchy, levelUp - 1).id })
            .from(getTable(slicedHierarchy, levelUp - 1))
            .where(
              and(
                eq(
                  getTable(slicedHierarchy, levelUp - 1)[
                    getForeignKey(slicedHierarchy, levelUp - 1)
                  ],
                  getTable(slicedHierarchy, levelUp).id,
                ),
                inArray(
                  getTable(slicedHierarchy, levelUp - 1).id,
                  prisms[slicedHierarchy[levelUp - 1].name] || [],
                ),
              ),
            ),
        ),
      ),
    )
  }

  if (levelUp > 2) {
    conditions.push(
      not(
        exists(
          db
            .select({
              id: sql<string>`${getTable(slicedHierarchy, levelUp - 2).id}`.as('id'),
            })
            .from(getTable(slicedHierarchy, levelUp - 1))
            .innerJoin(
              getTable(slicedHierarchy, levelUp - 2),
              eq(
                getTable(slicedHierarchy, levelUp - 2)[
                  getForeignKey(slicedHierarchy, levelUp - 2)
                ],
                getTable(slicedHierarchy, levelUp - 1).id,
              ),
            )
            .where(
              and(
                eq(
                  getTable(slicedHierarchy, levelUp - 1)[
                    getForeignKey(slicedHierarchy, levelUp - 1)
                  ],
                  getTable(slicedHierarchy, levelUp).id,
                ),
                inArray(
                  getTable(slicedHierarchy, levelUp - 2).id,
                  prisms[slicedHierarchy[levelUp - 2].name] || [],
                ),
              ),
            ),
        ),
      ),
    )
  }

  return baseQuery.where(and(...conditions))
}

/**
 * Applies prism constraints to a database query based on the resource hierarchy.
 * This function constructs conditions to filter results based on predefined "prisms"
 * which restrict access to certain parts of the hierarchical data.
 *
 * @param db - The Drizzle instance.
 * @param resource - The target hierarchical resource (e.g., Project, Layer).
 * @param prisms - An object containing prism filters.
 *                 Example: `{ organisation: ['orgCode1'], project: ['projectCode1'] }`
 * @returns An array of SQL conditions to be applied to the main query. Returns an empty array if no prisms are applicable or provided.
 */
export const applyPrismConstraints = (
  db: any,
  resource: HierarchicalResource,
  prisms: any,
) => {
  if (!Object.values(prisms).some(arr => Array.isArray(arr) && arr.length > 0))
    return []

  const slicedHierarchy = getSlicedHierarchy(resource)
  const depth = slicedHierarchy.length

  const subQueries = []
  for (let levelUp = 1; levelUp < depth; levelUp++) {
    const baseLevelQuery = db.$with(`level_min_${levelUp}`)
    subQueries.push(
      baseLevelQuery.as(createLevelQuery(db, slicedHierarchy, levelUp, prisms)),
    )
  }

  let baseQuery = db.with(...subQueries)
  baseQuery = baseQuery
    .select({ id: getTable(slicedHierarchy, 0).id })
    .from(getTable(slicedHierarchy, 0))

  const subQueryConditions = []

  for (let i = 1; i < depth; i++) {
    baseQuery = baseQuery.innerJoin(
      getTable(slicedHierarchy, i),
      eq(
        getTable(slicedHierarchy, i - 1)[getForeignKey(slicedHierarchy, i - 1)],
        getTable(slicedHierarchy, i).id,
      ),
    )
    // CTE names must be emitted as identifiers, not string literals.
    subQueryConditions.push(
      sql`${getTable(slicedHierarchy, i).id} IN (SELECT id FROM ${sql.raw(`level_min_${i}`)})`.inlineParams(),
    )
  }

  return [
    inArray(
      getTable(slicedHierarchy, 0).id,
      baseQuery.where(or(...subQueryConditions)),
    ),
  ]
}

/*
 * Create the path for a JSON column in a table
 * @param table - The table to apply the condition to
 * @param path - The path to the column to apply the condition to
 * @param value - The value to apply the condition to
 * @returns The condition
 */
export const createJsonPathCondition = (
  table: Table,
  path: string[],
  value: unknown,
) => {
  const [baseColumn, ...jsonPath] = path
  const jsonPathStr = jsonPath.map(p => `$.${p}`).join('.')

  // Handle array of values
  if (Array.isArray(value)) {
    return sql`json_extract(${table[baseColumn as keyof typeof table]}, ${jsonPathStr}) IN (${sql.join(
      value.map(v => sql`${v}`),
      sql`, `,
    )})`
  }

  // Backward compatibility for deprecated URL-based string booleans
  if (value === 'true' || value === 'false') {
    return sql`json_extract(${table[baseColumn as keyof typeof table]}, ${jsonPathStr}) = ${value === 'true'}`
  }

  // Handle single value
  return sql`json_extract(${table[baseColumn as keyof typeof table]}, ${jsonPathStr}) = ${value}`
}

// ═══════════════════════
// 6. TRANSFORMATIONS :: LOCALE
// ═══════════════════════

function normalizeLocaleRecordEntries<T extends Record<string, unknown>>(
  i18n: Record<string, T>,
): Record<string, T> {
  return Object.entries(i18n).reduce(
    (acc, [rawLocale, entry]) => {
      const inferredLocale = toLocaleKebab(rawLocale as Locale)
      const locale =
        typeof entry?.locale === 'string' && entry.locale.length > 0
          ? toLocaleKebab(entry.locale as Locale)
          : inferredLocale
      acc[locale] = {
        ...entry,
        locale,
      } as T
      return acc
    },
    {} as Record<string, T>,
  )
}

function toFormLocaleRecord<T extends Record<string, unknown>>(
  i18n: Record<string, T> | null,
): Record<string, T> | null {
  if (!i18n) return null
  return Object.entries(i18n).reduce(
    (acc, [rawLocale, entry]) => {
      const locale =
        typeof entry?.locale === 'string' && entry.locale.length > 0
          ? entry.locale
          : rawLocale
      acc[toLocaleKey(locale as Locale)] = entry
      return acc
    },
    {} as Record<string, T>,
  )
}

// Helper function to safely transform i18n data
export const transformI18nSafely = (
  i18n: any[] | Record<string, any> | null | undefined,
  fallback: any = null,
): Record<string, any> | null => {
  if (!i18n) return fallback

  if (Array.isArray(i18n)) {
    return i18n.length > 0 ? toFormLocaleRecord(toLocaleMap(i18n)) : fallback
  }

  // Already transformed or is a Record
  const normalized = normalizeLocaleRecordEntries(i18n as Record<string, any>)
  return toFormLocaleRecord(normalized)
}

// Helper function to check if an object is already a transformed locale map
const isTransformedLocaleMap = <T extends LocaleBundle>(
  value: any,
): value is Record<Locale, T> => {
  // Check if it's an object (not array or null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  // Check if all keys are supported locales
  const keys = Object.keys(value)
  const allKeysAreLocales = keys.every(key =>
    supportedLocaleKeys.includes(key as LocaleKey),
  )
  if (!allKeysAreLocales) return false

  // Check if all values have a 'locale' property matching their key
  return keys.every(
    key => value[key] && typeof value[key] === 'object' && value[key].locale === key,
  )
}

// T extends Translation ensures the generic type has the required lang property
export const toLocaleMap = <T extends LocaleBundle>(
  i18n: T[] | Record<Locale, T> | null,
): Record<Locale, T> | null => {
  // If there are no translations, return null
  if (!i18n) {
    return null
  }

  // Test whether i18n is already transformed - if so, return as-is
  if (isTransformedLocaleMap<T>(i18n)) {
    // TODO : Figure out where the unnecessary toLocalMap call is coming from.
    return i18n
  }

  // If it's an array, proceed with transformation
  if (Array.isArray(i18n)) {
    if (i18n.length === 0) return null
    return i18n.reduce(
      (acc: Record<Locale, T>, bundle: T) => {
        const locale = toLocaleKebab(bundle.locale as Locale | LocaleKey)
        const isCanonicalLocale = bundle.locale === locale

        // Prefer canonical DB-locale rows when stale camelCase duplicates exist.
        if (!acc[locale] || isCanonicalLocale) {
          acc[locale] = {
            ...bundle,
            locale,
          }
        }
        return acc
      },
      {} as Record<Locale, T>,
    )
  }

  // Strict contract: do not fabricate locale entries for invalid shapes.
  console.error('Invalid i18n format:', i18n)
  return null
}

// ═══════════════════════
// 8. ORDERING
// ═══════════════════════

type LocalizedOrderByParams = {
  db: Database
  locale?: Locale
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
  fallbackSortBy?: string
  fallbackColumn: AnyColumn
  baseTable: Table
  localizedSortColumns: Partial<Record<string, AnyColumn>>
  i18nTable: SQLiteTableWithColumns<any>
  parentIdColumn: AnyColumn
  foreignKeyColumn: AnyColumn
  localeColumn: AnyColumn
}

/**
 * Builds a deterministic order-by clause with optional locale-aware i18n sorting.
 * Uses a correlated subquery for the requested locale and falls back to base-column sorting.
 */
export const toOrderByWithLocalizedFields = ({
  db,
  locale,
  sortBy,
  sortOrder,
  fallbackSortBy = 'modifiedAt',
  fallbackColumn,
  baseTable,
  localizedSortColumns,
  i18nTable,
  parentIdColumn,
  foreignKeyColumn,
  localeColumn,
}: LocalizedOrderByParams): SQL<unknown>[] => {
  const resolvedSortBy = sortBy || fallbackSortBy
  const resolvedSortOrder = sortOrder || 'desc'
  const localizedSortColumn = localizedSortColumns[resolvedSortBy]

  if (localizedSortColumn && locale) {
    const localizedValueQuery = db
      .select({ value: sql<string>`${localizedSortColumn}` })
      .from(i18nTable)
      .where(and(eq(foreignKeyColumn, parentIdColumn), eq(localeColumn, locale)))
      .limit(1)

    const localizedValue = sql<string>`coalesce((${localizedValueQuery}), '')`

    return [
      resolvedSortOrder === 'desc' ? desc(localizedValue) : asc(localizedValue),
      desc(fallbackColumn),
    ]
  }

  const sortColumn = baseTable[resolvedSortBy as keyof typeof baseTable]
  if (!sortColumn) {
    throw new Error(`Invalid sort column: ${resolvedSortBy}`)
  }

  return [
    resolvedSortOrder === 'desc'
      ? desc(sortColumn as AnyColumn)
      : asc(sortColumn as AnyColumn),
    desc(fallbackColumn),
  ]
}

// ═══════════════════════
// 9. VALIDATION :: FIELDS
// ═══════════════════════

export const isFieldUnique = async <T extends Resource>(
  db: Database,
  data: T,
  resourceType: ResourceType = 'organisation',
  field: Field = 'code',
): Promise<boolean> => {
  // Check whether the organisation code already exists
  const currentResourceConfig = resourceConfig[resourceType as HierarchicalResource] // Cast to FirstClassResource
  if (!currentResourceConfig) {
    throw new Error(`Invalid resource type: ${resourceType}`)
  }
  const table = currentResourceConfig.table
  const tableField = table[field]
  const dataValue = data[field as keyof T]

  if (tableField === undefined || dataValue === undefined) {
    // Or handle this case as an error, depending on expected behavior
    console.warn(
      `Field ${String(field)} or its value is undefined for resource ${resourceType}`,
    )
    return false
  }

  const [existingEntity] = await db
    .select()
    .from(table)
    .where(eq(tableField, dataValue))
    .limit(1)
  return !existingEntity
}

export const isFieldChanged = async <T extends ResourceDB>(
  db: Database,
  id: string,
  value: string,
  resourceType: ResourceType = 'organisation',
  field: Field = 'code',
): Promise<boolean> => {
  // Check whether the provided code is different from the one in the database
  const currentResourceConfig = resourceConfig[resourceType as HierarchicalResource] // Cast to FirstClassResource
  if (!currentResourceConfig) {
    throw new Error(`Invalid resource type: ${resourceType}`)
  }
  const table = currentResourceConfig.table
  const tableIdField = table.id
  const tableField = table[field]

  if (tableIdField === undefined || tableField === undefined) {
    // Or handle this case as an error
    console.warn(
      `Field id or ${String(field)} is undefined for resource ${resourceType}`,
    )
    return false
  }

  const [existingEntity] = await db
    .select()
    .from(table)
    .where(eq(tableIdField, id))
    .limit(1)

  if (!existingEntity) {
    return false // Organisation not found
  }

  const existingValue = existingEntity[field as keyof T]
  if (existingValue === undefined) {
    console.warn(
      `Field ${String(field)} is undefined in existing entity for resource ${resourceType}`,
    )
    return false
  }

  return existingValue !== value
}

// ═══════════════════════
// 7. TRANSFORMATIONS :: RECORDS
// ═══════════════════════

/**
 * Transforms a record of data into an array of related records
 * @param data Record mapping IDs to data objects
 * @param foreignKeyName Name of the foreign key field to add
 * @param foreignKeyValue Value of the foreign key to set
 * @param keyName Optional name of the key field to add (defaults to 'id')
 * @returns Array of objects with the original data plus foreign key and optional key
 */
export const toRelatedRecords = <
  T extends Record<string, unknown>,
  KeyValue extends string = string,
  K extends string = 'id',
  F extends string = 'id',
>(
  data: Record<KeyValue, T>,
  foreignKeyName: F,
  foreignKeyValue: string,
  keyName: K = 'id' as K,
): Array<T & Record<K, KeyValue> & Record<F, string>> => {
  return Object.entries(data).map(([key, rawValue]) => {
    const isLocaleKey = keyName === 'locale'
    const valueRecord = rawValue as Record<string, unknown>
    const normalizedLocale =
      isLocaleKey && typeof valueRecord.locale === 'string'
        ? toLocaleKebab(valueRecord.locale as Locale | LocaleKey)
        : undefined

    return {
      ...(rawValue as T),
      ...(normalizedLocale
        ? ({ locale: normalizedLocale } as unknown as Partial<T>)
        : {}),
      [keyName]: key,
      [foreignKeyName]: foreignKeyValue,
    } as T & Record<K, KeyValue> & Record<F, string>
  })
}

/**
 * Returns the first row from a probe-style query result or `null` when empty.
 * @param rows - Query result rows.
 * @returns The first row or `null`.
 */
export const firstOrNull = <T>(rows: T[]): T | null => rows[0] ?? null

/**
 * Resolves a required probe value or delegates to a caller-provided missing branch.
 * @param probe - Probe result to validate.
 * @param onNotFound - Callback invoked when the probe is empty.
 * @returns The probe value or the callback result.
 */
export const resolveRequiredProbe = <T, TMissing>(
  probe: T | null | undefined,
  onNotFound: () => TMissing,
): T | TMissing => probe ?? onNotFound()

// ═══════════════════════
// 10. VALIDATION :: TABLES
// ═══════════════════════

// Helper function to validate column names against a table
export function validateTableColumns(
  table: Table,
  columns: string[],
  exclude: string[] = [],
): { valid: boolean; invalidColumns: string[] } {
  const tableColumns = Object.keys(table)
  const invalidColumns = columns.filter(
    col => !tableColumns.includes(col) && !exclude.includes(col),
  )
  return {
    valid: invalidColumns.length === 0,
    invalidColumns,
  }
}

export default client
