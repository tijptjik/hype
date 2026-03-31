// DRIZZLE
import { and, eq, like, sql, or } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  organisation,
  organisationI18n,
  organisationRole,
  project,
} from '../schema'
// SERVICES
import {
  firstOrNull,
  resolveRequiredProbe,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
} from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { getOrganisationHubFilter } from './hub'
// TYPES
import type { InferInsertModel, SQL } from 'drizzle-orm'
import type {
  Id,
  Database,
  Locale,
  LocaleKey,
  QueryParams,
  ListResponse,
  OrganisationProbe,
  OrganisationUpdateProbe,
  OrganisationCommandProbe,
} from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type {
  OrganisationDB,
  OrganisationDBNew,
  OrganisationDBPartial,
  OrganisationDBRaw,
  OrganisationI18nDB,
  OrganisationI18nNew,
  OrganisationI18nPartial,
  OrganisationRoleDB,
  OrganisationRoleNew,
} from '$lib/db/zod/schema/organisation.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createOrganisation
//    - createI18n
//    - createUserRoles
//
// 1.2 CRUD :: CREATE (SHAPING)
//    - toUserRoles
//
// 2.1 CRUD :: READ
//    - listOrganisations
//    - getOrganisation
//
// 2.2 CRUD :: READ (PROBES)
//    - probeOrganisationQuery
//    - probeExistingOrganisation
//    - probeOrganisationForUpdate
//    - probeOrganisationForCommand
//    - resolveOrganisationCommandProbe
//
// 2.3 CRUD :: READ (RELATED)
//    - listUserRoles
//    - listUserRoleAssignments
//
// 2.4 CRUD :: READ (LOOKUPS)
//    - getOrganisationForFeatureId
//    - getOrganisationForProjectId
//
// 3.1 CRUD :: UPDATE
//    - updateOrganisationById
//    - updateOrganisationByIdWithConcurrency
//    - updateOrganisationPublishedStateById
//    - cascadeOrganisationPublishedStateToDescendants
//    - updateOrganisationArchivedStateById
//    - updateI18n
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - syncUserRoles
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════

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
 * Creates relational i18n records for an organisation
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<LocaleKey, OrganisationI18nNew>,
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
    userRoles as InferInsertModel<typeof organisationRole>[],
    'organisationId',
    organisationId,
  )
}

// ═══════════════════════
// 1.2 CRUD :: CREATE (SHAPING)
// ═══════════════════════

/**
 * Maps organisation form role rows into persisted role rows bound to organisationId.
 */
export const toUserRoles = (
  userRoles: Array<{ userId: string; role: string }>,
  organisationId: string,
): Array<{ organisationId: string; userId: string; role: string }> =>
  userRoles.map(userRole => ({
    organisationId,
    userId: userRole.userId,
    role: userRole.role,
  }))

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Narrows hydrated Drizzle organisation rows to the current raw organisation contract.
 * Keeps generic relation inference mismatches contained at the DB boundary.
 */
const toOrganisationDbRaw = (row: unknown): OrganisationDBRaw =>
  row as OrganisationDBRaw

/**
 * Narrows hydrated Drizzle organisation row collections to the current raw contract.
 * Used for `findMany` results where relation inference is wider than our API shapers need.
 */
const toOrganisationDbRawList = (rows: unknown[]): OrganisationDBRaw[] =>
  rows as OrganisationDBRaw[]

/**
 * listOrganisations operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
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
    locale?: Locale
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
  const orderBy = toOrderByWithLocalizedFields({
    db,
    locale: query?.locale,
    sortBy,
    sortOrder,
    fallbackColumn: organisation.modifiedAt,
    baseTable: organisation,
    localizedSortColumns: {
      name: organisationI18n.name,
      nameShort: organisationI18n.nameShort,
      description: organisationI18n.description,
    },
    i18nTable: organisationI18n,
    parentIdColumn: organisation.id,
    foreignKeyColumn: organisationI18n.organisationId,
    localeColumn: organisationI18n.locale,
  })

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
    data: toOrganisationDbRawList(data),
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

/**
 * getOrganisation operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
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

  const row = await db.query.organisation.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
  return row ? toOrganisationDbRaw(row) : undefined
}

// ═══════════════════════
// 2.2 CRUD :: READ (PROBES)
// ═══════════════════════

/**
 * Probes organisation visibility/scope fields for read authorization.
 * @param db - The database instance.
 * @param params - Lookup reference and key selector.
 * @returns Minimal probe payload or `null`.
 */
export const probeOrganisationQuery = async (
  db: Database,
  params: { ref: string; refKey?: 'id' | 'code' },
): Promise<OrganisationProbe | null> => {
  return firstOrNull(
    await db
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
      .limit(1),
  )
}

/**
 * probeExistingOrganisation operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const probeExistingOrganisation = async (
  db: Database,
  code: string,
): Promise<{ id: string } | null> => {
  return firstOrNull(
    await db
      .select({ id: organisation.id })
      .from(organisation)
      .where(eq(organisation.code, code))
      .limit(1),
  )
}

/**
 * Probes mutable organisation fields for update authorization and stale-write checks.
 * @param db - The database instance.
 * @param organisationId - Target organisation id.
 * @returns Minimal update probe payload or `null`.
 */
export const probeOrganisationForUpdate = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationUpdateProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: organisation.id,
        code: organisation.code,
        hubId: organisation.hubId,
        capabilities: organisation.capabilities,
        modifiedAt: organisation.modifiedAt,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId))
      .limit(1),
  )
}

/**
 * probeOrganisationForCommand operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const probeOrganisationForCommand = async (
  db: Database,
  organisationId: Id,
): Promise<OrganisationCommandProbe | null> => {
  return firstOrNull(
    await db
      .select({
        id: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId))
      .limit(1),
  )
}

/**
 * Resolves organisation command probe or delegates to not-found branch.
 * @param db - The database instance.
 * @param organisationId - Target organisation id.
 * @param onNotFound - Callback invoked when target is missing.
 * @returns Command probe payload.
 */
export const resolveOrganisationCommandProbe = async (
  db: Database,
  organisationId: Id,
  onNotFound: () => never,
): Promise<OrganisationCommandProbe> => {
  const probed = await probeOrganisationForCommand(db, organisationId)
  return resolveRequiredProbe(probed, onNotFound)
}

// ═══════════════════════
// 2.3 CRUD :: READ (RELATED)
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
 * listUserRoleAssignments operation.
 * Used by organisation DB workflows to keep persistence behavior centralized.
 */
export const listUserRoleAssignments = async (
  db: Database,
  organisationId: string,
): Promise<Array<{ userId: string; role: string }>> => {
  return await db
    .select({
      userId: organisationRole.userId,
      role: organisationRole.role,
    })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, organisationId))
}

// ═══════════════════════
// 2.4 CRUD :: READ (LOOKUPS)
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

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════

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

/**
 * Updates organisation fields with optimistic concurrency guard on `modifiedAt`.
 * @param db - The database instance.
 * @param params - Update payload including expected `updatedAt`.
 * @returns Updated id/modifiedAt pair or `null` when stale/missing.
 */
export const updateOrganisationByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: {
      code: string
      url: string | null
      capabilities?: OrganisationDB['capabilities']
    }
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

/**
 * Toggles published state and publication metadata for an organisation.
 * @param db - The database instance.
 * @param params - Target id, next publish state, and publisher id.
 * @returns Updated id/state pair or `null`.
 */
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

/**
 * Cascades an organisation publish-state change into descendant projects, layers, and features.
 * Existing local publish snapshots are preserved while an ancestor remains unpublished.
 * @param db - The database instance.
 * @param params - The parent organisation id and next publish state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeOrganisationPublishedStateToDescendants = async (
  db: Database,
  params: {
    organisationId: Id
    state: boolean
  },
): Promise<void> => {
  await db
    .update(project)
    .set({
      localIsPublished: params.state
        ? null
        : sql`coalesce(${project.localIsPublished}, ${project.isPublished})`,
      isPublished: params.state
        ? sql`coalesce(${project.localIsPublished}, ${project.isPublished})`
        : sql`0`,
    })
    .where(eq(project.organisationId, params.organisationId))

  await db
    .update(layer)
    .set({
      localIsPublished: params.state
        ? null
        : sql`coalesce(${layer.localIsPublished}, ${layer.isPublished})`,
      isPublished: params.state
        ? sql`coalesce(${layer.localIsPublished}, ${layer.isPublished})`
        : sql`0`,
    })
    .where(eq(layer.organisationId, params.organisationId))

  await db
    .update(feature)
    .set({
      localIsPublished: params.state
        ? null
        : sql`coalesce(${feature.localIsPublished}, ${feature.isPublished})`,
      isPublished: params.state
        ? sql`coalesce(${feature.localIsPublished}, ${feature.isPublished})`
        : sql`0`,
    })
    .where(eq(feature.organisationId, params.organisationId))
}

/**
 * Toggles archived state for an organisation.
 * @param db - The database instance.
 * @param params - Target id and next archived state.
 * @returns Updated id/state pair or `null`.
 */
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

/**
 * Updates translations for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param organisationId - The ID of the organisation
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<LocaleKey, OrganisationI18nPartial>,
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
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Updates user roles for an organisation by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param userRoles - Array of user roles to update
 * @param organisationId - The ID of the organisation
 * @returns Array of updated user roles with associated user information
 */
export const syncUserRoles = async (
  db: Database,
  userRoles: OrganisationRoleNew[],
  organisationId: string,
): Promise<OrganisationRoleDB[]> => {
  return await replaceManyRelated(
    db,
    organisationRole,
    userRoles as InferInsertModel<typeof organisationRole>[],
    organisationRole.organisationId,
    organisationId,
  )
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
