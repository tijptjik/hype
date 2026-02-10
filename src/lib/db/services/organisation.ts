// SVELTEKIT
import { superValidate, type SuperValidated } from 'sveltekit-superforms'
// DRIZZLE
import { and, eq, type SQL, like, sql, or } from 'drizzle-orm'
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
import type {
  OrganisationDB,
  OrganisationNew,
  Organisation,
  Id,
  Database,
  OrganisationDBNew,
  Locale,
  OrganisationI18nNew,
  OrganisationI18nPartial,
  OrganisationRoleNew,
  OrganisationDBPartial,
  OrganisationDBRaw,
  OrganisationI18nDB,
  OrganisationRoleDB,
  HubOptsExtended,
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
  query?: {
    q?: string
    searchColumns?: string[]
    ignoreHubFilter?: boolean
  },
): Promise<OrganisationDBRaw[]> => {
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
      conditions.push(or(...searchConditions)!)
    }
  }

  return await db.query.organisation.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit: pagination?.limit,
    offset: pagination?.offset,
  })
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

export const searchOrganisations = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  search: string,
  opts: HubOptsExtended,
  searchColumns: string[] = ['code', 'name', 'description'],
): Promise<OrganisationDBRaw[]> => {
  return listOrganisations(db, withRelations, conditions, opts, undefined, {
    q: search,
    searchColumns,
    // Ignore hubfilter, cause this is primarily used to configure hub settings
    ignoreHubFilter: true,
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
): Promise<OrganisationDB> => await insert(db, organisation, data)

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
  return await insertManyRelated(
    db,
    organisationI18n,
    toRelatedRecords(i18n, 'organisationId', organisationId, 'locale') as any,
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
  return await replaceManyRelated(
    db,
    organisationI18n,
    toRelatedRecords(i18n, 'organisationId', organisationId, 'locale') as any,
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
  data: OrganisationNew,
) => {
  const organisation = await createOrganisation(db, data)
  const i18n = await createI18n(db, data.i18n!, organisation.id)
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
  data: Organisation,
  lookupCode?: string,
) => {
  const codeToUse = lookupCode || data.code
  const organisation = await updateOrganisation(db, data, codeToUse)
  const i18n = await updateI18n(db, data.i18n!, organisation.id)
  await updateUserRoles(db, data.userRoles, organisation.id)
  const userRoles = await listUserRoles(db, organisation.id)
  return { ...organisation, i18n, userRoles }
}

// ═══════════════════════
// 5. UTILS :: SHAPING
// ═══════════════════════

/**
 * Rebuilds form data from database entities
 * @param organisation - The organisation database entity
 * @param translations - Array of organisation translations
 * @param userRoles - Array of organisation user roles with nested user objects
 * @returns Validated form data
 */
export const toFormShape = async (
  organisation: OrganisationDB,
  i18n: OrganisationI18nNew[],
  userRoles: OrganisationRoleDB[],
  isSuperAdmin: boolean = false,
): Promise<SuperValidated<Organisation>> => {
  const formData: Organisation = {
    ...organisation,
    i18n: transformI18nSafely(i18n) as Record<Locale, OrganisationI18nNew>,
    userRoles,
  }

  // Use SuperAdmin schema if user is SuperAdmin, otherwise regular schema
  const schema = isSuperAdmin ? OrganisationSuperAdminAPI : OrganisationAPI

  // @ts-expect-error TODO - Fix Zod type error
  const form = await superValidate(formData, zod(schema))
  return form as SuperValidated<Organisation>
}

export const toResponseShape = async (
  organisation: OrganisationDB,
  i18n: OrganisationI18nNew[],
  userRoles: OrganisationRoleDB[],
  isCollection: boolean = false,
  isSuperAdmin: boolean = false,
) => {
  const data: Organisation = {
    ...organisation,
    i18n: transformI18nSafely(i18n),
    userRoles,
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
