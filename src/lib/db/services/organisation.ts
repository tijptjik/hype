// SVELTEKIT
import { superValidate, type SuperValidated } from 'sveltekit-superforms'
// DRIZZLE
import { and, eq, like, sql, or, asc, desc } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  organisation,
  organisationI18n,
  organisationRole,
  project,
} from '../schema'
// ZOD
import { zod } from 'sveltekit-superforms/adapters'
import {
  OrganisationAPI,
  OrganisationCollectionAPI,
  OrganisationSuperAdminAPI,
  OrganisationCollectionSuperAdminAPI,
} from '../zod'
// SERVICES
import { toRelatedRecords, transformI18nSafely } from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { getOrganisationHubFilter } from './hub'
// TYPES
import type { AnyColumn, InferInsertModel, SQL } from 'drizzle-orm'
import type {
  OrganisationDB,
  OrganisationNewWithI18n,
  OrganisationWithI18n,
  Organisation,
  OrganisationCollection,
  OrganisationCollectionSuperAdmin,
  OrganisationSuperAdmin,
  Id,
  Database,
  OrganisationDBNew,
  Locale,
  QueryParams,
  OrganisationI18nNew,
  OrganisationI18nPartial,
  OrganisationFormInput,
  OrganisationRoleNew,
  OrganisationDBPartial,
  OrganisationDBRaw,
  OrganisationI18nDB,
  OrganisationRoleDB,
  HubOptsExtended,
  ListResponse,
  EntityResponse,
  SessionUser,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listOrganisations
//    - getOrganisation
//    - createOrganisation
//    - updateOrganisation
//
// 2. CRUD :: RELATIONAL OPERATIONS (OrganisationI18n)
//    - createI18n
//    - updateI18n
//
// 3. CRUD :: RELATIONAL OPERATIONS (OrganisationRole)
//    - createUserRoles
//    - updateUserRoles
//    - listUserRoles
//
// 4. CRUD :: ORCHESTRATION
//    - createOrganisationWithRelated
//    - updateOrganisationWithRelated
//
// 5. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//
// 6. UTILS :: LOOKUPS
//    - getOrganisationForFeatureId
//    - getOrganisationForProjectId
//

/********************
 *  1. CRUD :: CORE OPERATIONS
 ************/

export const listOrganisations = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: {
    q?: string
    searchColumns?: string[]
    ignoreHubFilter?: boolean
    filtersToApply?: QueryParams
  },
): Promise<ListResponse<OrganisationDBRaw>> => {
  const startedAt = Date.now()
  // Core or non-core hub filtering
  if (!query?.ignoreHubFilter) {
    const hubFilter = getOrganisationHubFilter(db, opts)
    if (hubFilter) {
      conditions.push(hubFilter)
    }
  }

  // Search is treated as a specialised filter.
  if (query?.q) {
    const search = query.q.toLowerCase()
    const searchColumns = query.searchColumns || ['code', 'name', 'description']
    const searchConditions: SQL<unknown>[] = []

    // Search in base organisation table columns
    const baseColumns = searchColumns.filter(col => col === 'code')
    for (const column of baseColumns) {
      const orgColumn = organisation[column as keyof typeof organisation]
      if (orgColumn) {
        searchConditions.push(like(sql`lower(${orgColumn})`, `%${search}%`))
      }
    }

    // Search in i18n table columns (name, description)
    const i18nColumns = searchColumns.filter(col =>
      ['name', 'description'].includes(col),
    )
    if (i18nColumns.length > 0) {
      // Create a subquery to check if any i18n record matches the search
      const i18nSearchConditions: SQL<unknown>[] = []
      for (const column of i18nColumns) {
        if (column === 'name') {
          i18nSearchConditions.push(
            sql`lower("organisationI18n"."name") like ${`%${search.toLowerCase()}%`}`,
          )
        } else if (column === 'description') {
          // Handle nullable description field
          i18nSearchConditions.push(
            sql`("organisationI18n"."description" IS NOT NULL AND lower("organisationI18n"."description") like ${`%${search.toLowerCase()}%`})`,
          )
        }
      }

      if (i18nSearchConditions.length > 0) {
        // Add condition that checks if organisation has any matching i18n records
        const combinedConditions =
          i18nSearchConditions.length === 1
            ? i18nSearchConditions[0]
            : sql`(${sql.join(i18nSearchConditions, sql` OR `)})`

        searchConditions.push(
          sql`EXISTS (
            SELECT 1 FROM "organisationI18n"
            WHERE "organisationI18n"."organisationId" = ${organisation.id}
            AND ${combinedConditions}
          )`,
        )
      }
    }

    if (searchConditions.length > 0) {
      if (searchConditions.length === 1) {
        conditions.push(searchConditions[0])
      } else {
        const combinedSearchCondition = or(...searchConditions)
        if (combinedSearchCondition) {
          conditions.push(combinedSearchCondition)
        }
      }
    }
  }

  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const sortColumn = organisation[sortBy as keyof typeof organisation]
  if (!sortColumn) {
    throw new Error(`Invalid sort column: ${sortBy}`)
  }
  const orderBy =
    sortOrder === 'desc' ? desc(sortColumn as AnyColumn) : asc(sortColumn as AnyColumn)

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const data = await db.query.organisation.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit,
    offset: pagination?.offset,
    orderBy,
  })
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(organisation)
  const totalRows = whereClause ? await countQuery.where(whereClause) : await countQuery
  const totalCount = Number(totalRows[0]?.count || 0)
  const offset = pagination?.offset ?? 0
  const hasMore = offset + data.length < totalCount
  const nextOffset = hasMore ? offset + data.length : null
  const durationMs = Date.now() - startedAt

  return {
    data,
    limit: pagination?.limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters: query?.filtersToApply,
    q: query?.q,
    durationMs,
  }
}

export const getOrganisation = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<OrganisationDBRaw | undefined> => {
  // Core or non-core hub filtering
  const hubFilter = getOrganisationHubFilter(db, opts)
  if (hubFilter) {
    conditions.push(hubFilter)
  }

  return await db.query.organisation.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
}

/**
 * Creates a new organisation in the database
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @returns The newly created organisation
 * @throws {Error} If the organisation creation fails
 */
export const createOrganisation = async (
  db: Database,
  data: OrganisationDBNew,
): Promise<OrganisationDB> =>
  await insert(db, organisation, {
    ...data,
    isPublished: data.isPublished ?? false,
  })

/**
 * Updates an existing organisation in the database
 * @param db - The database instance
 * @param data - The updated organisation data
 * @param ref - The organisation code reference
 * @returns The updated organisation
 * @throws {Error} If the organisation update fails or organisation is not found
 */
export const updateOrganisation = async (
  db: Database,
  data: OrganisationDBPartial,
  ref: string,
): Promise<OrganisationDB> =>
  await update(db, organisation, data, organisation.code, ref)

/**
 * Updates an existing organisation in the database by ID
 * @param db - The database instance
 * @param data - The updated organisation data
 * @param id - The ID of the organisation
 * @returns The updated organisation
 */
export const updateOrganisationById = async (
  db: Database,
  data: OrganisationDBPartial,
  id: Id,
): Promise<OrganisationDB> => await update(db, organisation, data, organisation.id, id)

// ═══════════════════════
// 2. CRUD :: RELATIONAL OPERATIONS (OrganisationI18n)
// ═══════════════════════

/**
 * Creates relational i18n records for an organisation
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, OrganisationI18nNew>,
  organisationId: string,
): Promise<OrganisationI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'organisationId',
    organisationId,
    'locale',
  ) as InferInsertModel<typeof organisationI18n>[]

  return await insertManyRelated(
    db,
    organisationI18n,
    relatedRecords,
    'organisationId',
    organisationId,
  )
}

/**
 * Updates translations for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, OrganisationI18nPartial>,
  organisationId: string,
): Promise<OrganisationI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'organisationId',
    organisationId,
    'locale',
  ) as InferInsertModel<typeof organisationI18n>[]

  return await replaceManyRelated(
    db,
    organisationI18n,
    relatedRecords,
    organisationI18n.organisationId,
    organisationId,
  )
}

// ═══════════════════════
// 3. CRUD :: RELATIONAL OPERATIONS (OrganisationRole)
// ═══════════════════════

/**
 * Reads user roles for an organisation
 * @param db - The database instance
 * @param organisationId - The ID of the organisation
 * @returns Array of user roles with associated user information
 */
export const listUserRoles = async (
  db: Database,
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  return await db.query.organisationRole.findMany({
    with: {
      user: true,
    },
    where: eq(organisationRole.organisationId, organisationId),
  })
}

/**
 * Creates user roles for an organisation
 * @param db - The database instance
 * @param userRoles - Array of new user roles to create
 * @param organisationId - The ID of the organisation
 * @returns Array of created user roles with associated user information
 */
export const createUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  return await insertManyRelated(
    db,
    organisationRole,
    userRoles,
    'organisationId',
    organisationId,
  )
}

/**
 * Maps organisation form role rows into persisted role rows bound to organisationId.
 */
export const toPersistedOrganisationUserRoles = (
  userRoles: OrganisationFormInput['data']['userRoles'],
  organisationId: string,
): Array<{ organisationId: string; userId: string; role: string }> =>
  userRoles.map(userRole => ({
    organisationId,
    userId: userRole.userId,
    role: userRole.role,
  }))

/**
 * Updates user roles for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param userRoles - Array of user roles to update
 * @param organisationId - The ID of the organisation
 * @returns Array of updated user roles with associated user information
 */
export const updateUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  return await replaceManyRelated(
    db,
    organisationRole,
    userRoles,
    organisationRole.organisationId,
    organisationId,
  )
}

// ═══════════════════════
// 4. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new organisation with translations and user roles
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @returns The newly created organisation
 */
export const createOrganisationWithRelated = async (
  db: Database,
  data: OrganisationNewWithI18n,
) => {
  const organisation = await createOrganisation(db, data)
  const i18n = await createI18n(db, data.i18n, organisation.id)
  await createUserRoles(db, data.userRoles, organisation.id)
  const userRoles = await listUserRoles(db, organisation.id)
  // organisation.image is null upon creation
  // organisation.publisher is null upon creation, as it's unpublished by default.
  return { ...organisation, i18n, userRoles }
}

/**
 * Updates an organisation with translations and user roles
 * @param db - The database instance
 * @param data - The organisation data to insert
 * @param lookupCode - Optional code to lookup the organisation (defaults to data.code)
 * @returns The newly created organisation
 */
export const updateOrganisationWithRelated = async (
  db: Database,
  data: OrganisationWithI18n,
  lookupCode?: string,
) => {
  const codeToUse = lookupCode || data.code
  const organisation = await updateOrganisation(db, data, codeToUse)
  const i18n = await updateI18n(db, data.i18n, organisation.id)
  await updateUserRoles(db, data.userRoles, organisation.id)
  const userRoles = await listUserRoles(db, organisation.id)
  return { ...organisation, i18n, userRoles }
}

// ═══════════════════════
// 5. UTILS :: SHAPING
// ═══════════════════════

/**
 * Rebuilds form data from database entities
 * @param organisation - The organisation entity with loaded relations
 * @returns Validated form data
 */
export const toFormShape = async (
  organisation: OrganisationDBRaw,
  isSuperAdmin: boolean = false,
): Promise<SuperValidated<Organisation>> => {
  const formData: Organisation = {
    ...organisation,
    i18n: transformI18nSafely(organisation.i18n) as Record<Locale, OrganisationI18nNew>,
    userRoles: organisation.userRoles,
  }

  // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
  const schema = isSuperAdmin ? OrganisationSuperAdminAPI : OrganisationAPI

  // @ts-expect-error TODO - Fix Zod type error
  const form = await superValidate(formData, zod(schema))
  return form as SuperValidated<Organisation>
}

export function toResponseShape(
  organisation: OrganisationDBRaw,
  isCollection: true,
  isSuperAdmin?: boolean,
): Promise<OrganisationCollection | OrganisationCollectionSuperAdmin>
export function toResponseShape(
  organisation: OrganisationDBRaw,
  isCollection?: false,
  isSuperAdmin?: boolean,
): Promise<Organisation | OrganisationSuperAdmin>
export const toResponseShape = async (
  organisation: OrganisationDBRaw,
  isCollection: boolean = false,
  isSuperAdmin: boolean = false,
): Promise<
  | Organisation
  | OrganisationSuperAdmin
  | OrganisationCollection
  | OrganisationCollectionSuperAdmin
> => {
  const data: Organisation = {
    ...organisation,
    i18n: transformI18nSafely(organisation.i18n),
    userRoles: organisation.userRoles,
  }

  // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
  if (isCollection) {
    return isSuperAdmin
      ? OrganisationCollectionSuperAdminAPI.parse(data)
      : OrganisationCollectionAPI.parse(data)
  } else {
    return isSuperAdmin
      ? OrganisationSuperAdminAPI.parse(data)
      : OrganisationAPI.parse(data)
  }
}

export const toEntityResponseShape = async (
  organisation: OrganisationDBRaw | null,
  user?: SessionUser,
): Promise<EntityResponse<Organisation | OrganisationSuperAdmin>> => {
  const startedAt = Date.now()

  if (!organisation) {
    return { data: null, durationMs: Date.now() - startedAt }
  }

  const data = await toResponseShape(organisation, false, user?.superAdmin || false)
  return { data, durationMs: Date.now() - startedAt }
}

export const toListResponseShape = async (
  result: ListResponse<OrganisationDBRaw>,
  user: SessionUser | undefined,
): Promise<ListResponse<OrganisationCollection | OrganisationCollectionSuperAdmin>> => {
  const {
    data: organisations,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  } = result
  const data = await Promise.all(
    organisations.map(organisation =>
      toResponseShape(organisation, true, user?.superAdmin || false),
    ),
  )

  return {
    data,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  }
}

// ═══════════════════════
// 6. UTILS :: LOOKUPS
// ═══════════════════════

/**
 * Retrieves the organisation associated with a feature ID
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForFeatureId = async (
  db: Database,
  featureId: Id,
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: { with: { organisation: true } } } } },
  })
  return record?.layer?.project?.organisation || undefined
}

/**
 * Retrieves the organisation associated with a project ID
 * @param db - The database instance
 * @param projectId - The ID of the project
 * @returns The associated organisation or undefined if not found
 */
export const getOrganisationForProjectId = async (
  db: Database,
  projectId: Id,
): Promise<OrganisationDB | undefined> => {
  const record = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    with: { organisation: true },
  })
  return record?.organisation || undefined
}
