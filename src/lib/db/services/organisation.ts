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
import {
  OrganisationAPI,
  OrganisationCardProfileAPI,
  OrganisationCollectionAPI,
  OrganisationSuperAdminAPI,
  OrganisationCollectionSuperAdminAPI,
  OrganisationDetailProfileAPI,
  OrganisationListProfileAPI,
} from '../zod'
// SERVICES
import { toRelatedRecords, transformI18nSafely } from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { getOrganisationHubFilter } from './hub'
import { toImageEnvelope } from './image'
import { ImageContextResource } from '$lib/enums'
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
  OrganisationEntityByProfile,
  OrganisationListByProfile,
  OrganisationProfile,
  OrganisationRoleDB,
  HubOptsExtended,
  ListResponse,
  EntityResponse,
  SessionUser,
  OrganisationProbe,
  OrganisationUpdateProbe,
  OrganisationCommandProbe,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listOrganisations
//    - getOrganisation
//    - probeOrganisationQuery
//    - probeExistingOrganisation
//    - probeOrganisationForUpdate
//    - probeOrganisationForCommand
//    - resolveOrganisationCommandProbe
//    - createOrganisation
//    - updateOrganisation
//    - updateOrganisationById
//    - updateOrganisationByIdWithConcurrency
//    - updateOrganisationPublishedStateById
//    - updateOrganisationArchivedStateById
//
// 2. CRUD :: RELATIONAL OPERATIONS (OrganisationI18n)
//    - createI18n
//    - updateI18n
//
// 3. CRUD :: RELATIONAL OPERATIONS (OrganisationRole)
//    - listUserRoles
//    - createUserRoles
//    - toPersistedOrganisationUserRoles
//    - syncOrganisationUserRoles
//
// 4. CRUD :: ORCHESTRATION
//    - createOrganisationWithRelated
//    - updateOrganisationWithRelated
//
// 5. UTILS :: SHAPING
//    - toProfileResponseShape
//    - toEntityResponseShape
//    - toListResponseShape
//
// 6. UTILS :: LOOKUPS
//    - getOrganisationForFeatureId
//    - getOrganisationForProjectId
//
// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

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

export const probeOrganisationQuery = async (
  db: Database,
  params: { ref: string; refKey?: 'id' | 'code' },
): Promise<OrganisationProbe | null> => {
  const [probe] = await db
    .select({
      id: organisation.id,
      hubId: organisation.hubId,
      isPublished: organisation.isPublished,
      isArchived: organisation.isArchived,
    })
    .from(organisation)
    .where(
      params.refKey === 'code'
        ? eq(organisation.code, params.ref)
        : eq(organisation.id, params.ref as Id),
    )
    .limit(1)

  return probe ?? null
}

export const probeExistingOrganisation = async (
  db: Database,
  code: string,
): Promise<{ id: string } | null> => {
  const [existing] = await db
    .select({ id: organisation.id })
    .from(organisation)
    .where(eq(organisation.code, code))
    .limit(1)

  return existing ?? null
}

export const probeOrganisationForUpdate = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationUpdateProbe | null> => {
  const [current] = await db
    .select({
      id: organisation.id,
      code: organisation.code,
      hubId: organisation.hubId,
      modifiedAt: organisation.modifiedAt,
    })
    .from(organisation)
    .where(eq(organisation.id, organisationId))
    .limit(1)

  return current ?? null
}

export const probeOrganisationForCommand = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationCommandProbe | null> => {
  const [current] = await db
    .select({
      id: organisation.id,
      hubId: organisation.hubId,
    })
    .from(organisation)
    .where(eq(organisation.id, organisationId))
    .limit(1)

  return current ?? null
}

export const resolveOrganisationCommandProbe = async (
  db: Database,
  organisationId: Id,
  onNotFound: () => never,
): Promise<OrganisationCommandProbe> => {
  const probed = await probeOrganisationForCommand(db, organisationId)
  if (!probed) return onNotFound()
  return probed
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

export const updateOrganisationByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: { code: string; url: string | null }
  },
): Promise<{ id: string; modifiedAt: string } | null> => {
  const [updated] = await db
    .update(organisation)
    .set(params.data)
    .where(
      and(
        eq(organisation.id, params.id),
        eq(organisation.modifiedAt, params.updatedAt),
      ),
    )
    .returning({
      id: organisation.id,
      modifiedAt: organisation.modifiedAt,
    })

  return updated ?? null
}

export const updateOrganisationPublishedStateById = async (
  db: Database,
  params: { id: Id; state: boolean; publisherId: string | null },
): Promise<{ id: string; isPublished: boolean } | null> => {
  const [updated] = await db
    .update(organisation)
    .set({
      isPublished: params.state,
      publishedAt: params.state ? new Date().toISOString() : null,
      publisherId: params.state ? params.publisherId : null,
    })
    .where(eq(organisation.id, params.id))
    .returning({
      id: organisation.id,
      isPublished: organisation.isPublished,
    })

  return updated ?? null
}

export const updateOrganisationArchivedStateById = async (
  db: Database,
  params: { id: Id; state: boolean },
): Promise<{ id: string; isArchived: boolean } | null> => {
  const [updated] = await db
    .update(organisation)
    .set({ isArchived: params.state })
    .where(eq(organisation.id, params.id))
    .returning({
      id: organisation.id,
      isArchived: organisation.isArchived,
    })

  return updated ?? null
}

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
export const syncOrganisationUserRoles = async (
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
  await syncOrganisationUserRoles(db, data.userRoles, organisation.id)
  const userRoles = await listUserRoles(db, organisation.id)
  return { ...organisation, i18n, userRoles }
}

// ═══════════════════════
// 5. UTILS :: SHAPING
// ═══════════════════════

const toProfileResponseShape = async (
  organisation: OrganisationDBRaw,
  profile: OrganisationProfile,
  isCollection: boolean,
  isSuperAdmin: boolean,
):
  | Organisation
  | OrganisationSuperAdmin
  | OrganisationCollection
  | OrganisationCollectionSuperAdmin
  | OrganisationListProfile
  | OrganisationCardProfile
  | OrganisationDetailProfile => {
  const data = {
    ...organisation,
    i18n: transformI18nSafely(organisation.i18n),
    userRoles: organisation.userRoles,
    image: organisation.image
      ? toImageEnvelope(
          organisation.image as Image,
          profile,
          ImageContextResource.organisation,
          organisation.id,
        )
      : null,
  }

  if (profile === 'list') return OrganisationListProfileAPI.parse(data)
  if (profile === 'card') return OrganisationCardProfileAPI.parse(data)
  if (profile === 'detail') return OrganisationDetailProfileAPI.parse(data)

  return isCollection
    ? isSuperAdmin
      ? OrganisationCollectionSuperAdminAPI.parse(data)
      : OrganisationCollectionAPI.parse(data)
    : isSuperAdmin
      ? OrganisationSuperAdminAPI.parse(data)
      : OrganisationAPI.parse(data)
}

export const toEntityResponseShape = async <P extends OrganisationProfile = 'detail'>(
  organisation: OrganisationDBRaw | null,
  user?: SessionUser,
  profile: P = 'detail' as P,
): Promise<EntityResponse<OrganisationEntityByProfile<P>>> => {
  const startedAt = Date.now()

  if (!organisation) {
    return { data: null, durationMs: Date.now() - startedAt }
  }

  const data = await toProfileResponseShape(
    organisation,
    profile,
    false,
    user?.superAdmin || false,
  )
  return {
    data: data as OrganisationEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

export const toListResponseShape = async <P extends OrganisationProfile = 'list'>(
  result: ListResponse<OrganisationDBRaw>,
  user: SessionUser | undefined,
  profile: P = 'list' as P,
): Promise<ListResponse<OrganisationListByProfile<P>>> => {
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
      toProfileResponseShape(organisation, profile, true, user?.superAdmin || false),
    ),
  )

  return {
    data: data as Array<OrganisationListByProfile<P>>,
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
