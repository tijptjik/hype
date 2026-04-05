// DRIZZLE
import { and, eq, like, or, sql, type SQL } from 'drizzle-orm'
// CAPABILITIES
import {
  getCapabilityKeysFromDefinitions,
  isProjectCapabilityKey,
  normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
// SCHEMA
import {
  feature,
  layer,
  organisation,
  organisationRole,
  project,
  projectI18n,
  projectRole,
  task,
} from '../schema'
// DB
import {
  firstOrNull,
  resolveRequiredProbe,
  toOrderByWithLocalizedFields,
  toRelatedRecords,
} from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { retryBusyRead } from './sqlite'
// ZOD
import { getProjectHubFilter } from './hub'
// TYPES
import type {
  CapabilityDefinitions,
  Id,
  Database,
  LocaleKey,
  Locale,
  ListResponse,
  QueryParams,
} from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type {
  ProjectAdminDBRaw,
  ProjectDB,
  ProjectDBNew,
  ProjectDBPartial,
  ProjectI18nDB,
  ProjectI18nNew,
  ProjectI18nPartial,
  ProjectRoleDB,
  ProjectRoleNew,
} from '$lib/db/zod/schema/project.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createProject
//    - createI18n
//    - createUserRoles
//
// 1.2 CRUD :: CREATE (SHAPING)
//    - toUserRoles
//
// 2.1 CRUD :: READ
//    - listProjects
//    - getProject
//
// 2.2 CRUD :: READ (PROBES)
//    - probeProjectQuery
//    - probeExistingProject
//    - probeProjectForUpdate
//    - probeProjectForCommand
//    - resolveProjectCommandProbe
//    - probeOrganisationHubForProject
//
// 2.3 CRUD :: READ (RELATED)
//    - listUserRoleAssignments
//
// 2.4 CRUD :: READ (LOOKUPS)
//    - getProjectForFeatureId
//
// 2.5 CRUD :: READ (MERGING)
//    - mergeOrganisationCapabilities
//
// 3.1 CRUD :: UPDATE
//    - updateProjectById
//    - updateProjectByIdWithConcurrency
//    - updateProjectPublishedStateById
//    - cascadeProjectPublishedStateToDescendants
//    - updateProjectArchivedStateById
//    - updateI18n
//
// 3.2 CRUD :: UPDATE (SYNC)
//    - syncUserRoles
//    - cascadeOrganisationToDescendants
//    - cascadeOrganisationCapabilitiesToProjects
//
// 4. CRUD :: DELETE
//    - No hard delete helpers in this module (intentional)

// ═══════════════════════
// 1.1 CRUD :: CREATE
// ═══════════════════════

/**
 * Creates a new project in the database.
 * @param db - The database instance.
 * @param data - The project data to insert.
 * @returns The newly created project.
 */
export const createProject = async (
  db: Database,
  data: ProjectDBNew,
): Promise<ProjectDB> =>
  (await insert(db, project, {
    ...data,
    isPublished: data.isPublished ?? false,
  })) as ProjectDB

/**
 * Creates relational i18n records for a project.
 * @param db - The database instance.
 * @param i18n - Record of translations for each target locale.
 * @param projectId - The ID of the project.
 * @returns The created translations.
 */
export const createI18n = async (
  db: Database,
  i18n: Record<LocaleKey, ProjectI18nNew>,
  projectId: string,
): Promise<ProjectI18nDB[]> => {
  const records = toRelatedRecords(i18n, 'projectId', projectId, 'locale')
  return await insertManyRelated(db, projectI18n, records, 'projectId', projectId)
}

/**
 * Ensures users are added as members to the organisation if they're not already.
 * @param db - The database instance.
 * @param userRoles - Array of project role rows.
 * @param organisationId - The ID of the organisation.
 */
const ensureOrganisationMembership = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  organisationId: string,
) => {
  const orgRoles = await db
    .select({ userId: organisationRole.userId })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, organisationId))

  const existingOrgUserIds = orgRoles.map(role => role.userId)
  const newOrgUsers = userRoles
    .map(role => role.userId)
    .filter(userId => !existingOrgUserIds.includes(userId))

  if (newOrgUsers.length > 0) {
    await db.insert(organisationRole).values(
      newOrgUsers.map(userId => ({
        userId,
        organisationId,
        role: 'member' as const,
      })),
    )
  }
}

/**
 * Creates project user roles and enforces parent organisation membership.
 * @param db - The database instance.
 * @param userRoles - Array of user roles to create.
 * @param projectId - The project id.
 * @param organisationId - Parent organisation id.
 * @returns Created project-role rows.
 */
export const createUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: string,
  organisationId: string,
): Promise<ProjectRoleNew[]> => {
  await ensureOrganisationMembership(db, userRoles, organisationId)

  return await insertManyRelated(
    db,
    projectRole,
    userRoles as ProjectRoleDB[],
    'projectId',
    projectId,
  )
}

// ═══════════════════════
// 1.2 CRUD :: CREATE (SHAPING)
// ═══════════════════════

/**
 * Maps submitted role rows into persisted project-role rows.
 * @param userRoles - Submitted role rows.
 * @param projectId - Target project id.
 * @returns Persistable project-role rows.
 */
export const toUserRoles = (
  userRoles: Array<{
    userId: string
    role: string
    capabilities?: ProjectRoleNew['capabilities']
  }>,
  projectId: string,
): ProjectRoleNew[] =>
  userRoles.map(userRole => ({
    projectId,
    userId: userRole.userId,
    role: userRole.role,
    capabilities: userRole.capabilities ?? {},
  }))

// ═══════════════════════
// 2.1 CRUD :: READ
// ═══════════════════════

/**
 * Lists projects with optional relation hydration, hub filters, search, sorting, and pagination.
 * @param db - The database instance.
 * @param withRelations - Optional Drizzle relation graph to hydrate.
 * @param conditions - SQL predicates already normalized by the caller.
 * @param opts - Hub scoping options.
 * @param pagination - Optional page controls.
 * @param sorting - Optional sort controls.
 * @param query - Optional text-query and filter metadata.
 * @returns Paginated hydrated project rows.
 */
export async function listProjects<
  TRow extends Record<string, unknown> = ProjectAdminDBRaw,
>(
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
): Promise<ListResponse<TRow>> {
  const startedAt = Date.now()
  if (!query?.ignoreHubFilter) {
    const hubFilter = getProjectHubFilter(db, opts)
    if (hubFilter) {
      conditions.push(hubFilter)
    }
  }

  if (query?.q) {
    const search = query.q.toLowerCase()
    const searchColumns = query.searchColumns || ['code', 'name', 'description']
    const searchConditions: SQL<unknown>[] = []

    const baseColumns = searchColumns.filter(column => column === 'code')
    for (const column of baseColumns) {
      const projectColumn = project[column as keyof typeof project]
      if (projectColumn) {
        searchConditions.push(like(sql`lower(${projectColumn})`, `%${search}%`))
      }
    }

    const i18nColumns = searchColumns.filter(column =>
      ['name', 'description'].includes(column),
    )
    if (i18nColumns.length > 0) {
      const i18nSearchConditions: SQL<unknown>[] = []
      for (const column of i18nColumns) {
        if (column === 'name') {
          i18nSearchConditions.push(
            sql`lower("projectI18n"."name") like ${`%${search}%`}`,
          )
        } else if (column === 'description') {
          i18nSearchConditions.push(
            sql`("projectI18n"."description" IS NOT NULL AND lower("projectI18n"."description") like ${`%${search}%`})`,
          )
        }
      }

      if (i18nSearchConditions.length > 0) {
        const combinedConditions =
          i18nSearchConditions.length === 1
            ? i18nSearchConditions[0]
            : sql`(${sql.join(i18nSearchConditions, sql` OR `)})`
        searchConditions.push(
          sql`EXISTS (
            SELECT 1 FROM "projectI18n"
            WHERE "projectI18n"."projectId" = ${project.id}
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
    fallbackColumn: project.modifiedAt,
    baseTable: project,
    localizedSortColumns: {
      name: projectI18n.name,
      nameShort: projectI18n.nameShort,
      description: projectI18n.description,
    },
    i18nTable: projectI18n,
    parentIdColumn: project.id,
    foreignKeyColumn: projectI18n.projectId,
    localeColumn: projectI18n.locale,
  })
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const baseQuery = {
    where: whereClause,
    limit: pagination?.limit,
    offset: pagination?.offset,
    orderBy,
  } as const

  const data = (await db.query.project.findMany({
    ...baseQuery,
    with: withRelations,
  })) as unknown as TRow[]
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(project)
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

/**
 * Loads a single project with optional relation graph and hub scoping.
 * @param db - The database instance.
 * @param withRelations - Optional Drizzle relation graph to hydrate.
 * @param conditions - Optional SQL predicates.
 * @param opts - Hub filtering options.
 * @returns The matching project or `undefined`.
 */
export async function getProject<
  TRow extends Record<string, unknown> = ProjectAdminDBRaw,
>(
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<TRow | undefined> {
  const hubFilter = getProjectHubFilter(db, opts)
  if (hubFilter) {
    conditions.push(hubFilter)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  return (await db.query.project.findFirst({
    with: withRelations,
    where,
  })) as unknown as TRow | undefined
}

// ═══════════════════════
// 2.2 CRUD :: READ (PROBES)
// ═══════════════════════

/**
 * Probes project visibility/scope fields for read authorization.
 * @param db - The database instance.
 * @param params - Lookup reference and key selector.
 * @returns Minimal probe payload or `null`.
 */
export const probeProjectQuery = async (
  db: Database,
  params: { ref: string; refKey?: 'id' | 'code' },
): Promise<{
  id: string
  organisationId: string
  hubId: string | null
  isPublished: boolean
  isArchived: boolean
} | null> => {
  return firstOrNull(
    await retryBusyRead(() =>
      db
        .select({
          id: project.id,
          organisationId: project.organisationId,
          hubId: organisation.hubId,
          isPublished: project.isPublished,
          isArchived: project.isArchived,
        })
        .from(project)
        .innerJoin(organisation, eq(project.organisationId, organisation.id))
        .where(
          params.refKey === 'code'
            ? eq(project.code, params.ref)
            : eq(project.id, params.ref),
        )
        .limit(1),
    ),
  )
}

/**
 * probeExistingProject operation.
 * Used by project DB workflows to keep persistence behavior centralized.
 */
export const probeExistingProject = async (
  db: Database,
  code: string,
): Promise<{ id: string } | null> => {
  return firstOrNull(
    await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.code, code))
      .limit(1),
  )
}

/**
 * Probes mutable project fields for update authorization and stale-write checks.
 * @param db - The database instance.
 * @param projectId - Target project id.
 * @returns Minimal update probe payload or `null`.
 */
export const probeProjectForUpdate = async (
  db: Database,
  projectId: Id,
): Promise<{
  id: string
  code: string
  organisationId: string
  capabilities: ProjectDB['capabilities']
  hubId: string | null
  modifiedAt: string
} | null> => {
  return firstOrNull(
    await db
      .select({
        id: project.id,
        code: project.code,
        organisationId: project.organisationId,
        capabilities: project.capabilities,
        hubId: organisation.hubId,
        modifiedAt: project.modifiedAt,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(project.id, projectId))
      .limit(1),
  )
}

/**
 * probeProjectForCommand operation.
 * Used by project DB workflows to keep persistence behavior centralized.
 */
const probeProjectForCommand = async (
  db: Database,
  projectId: Id,
): Promise<{
  id: string
  organisationId: string
  hubId: string | null
  license: ProjectDB['license']
} | null> => {
  return firstOrNull(
    await db
      .select({
        id: project.id,
        organisationId: project.organisationId,
        hubId: organisation.hubId,
        license: project.license,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(project.id, projectId))
      .limit(1),
  )
}

/**
 * Resolves project command probe or delegates to caller-provided not-found branch.
 * @param db - The database instance.
 * @param projectId - Target project id.
 * @param onNotFound - Callback invoked when target project is missing.
 * @returns Command probe payload.
 */
export const resolveProjectCommandProbe = async (
  db: Database,
  projectId: Id,
  onNotFound: () => never,
): Promise<{
  id: string
  organisationId: string
  hubId: string | null
  license: ProjectDB['license']
}> => {
  const probed = await probeProjectForCommand(db, projectId)
  return resolveRequiredProbe(probed, onNotFound)
}

/**
 * probeOrganisationHubForProject operation.
 * Used by project DB workflows to keep persistence behavior centralized.
 */
export const probeOrganisationHubForProject = async (
  db: Database,
  organisationId: Id,
): Promise<{ organisationId: string; hubId: string | null } | null> => {
  return firstOrNull(
    await db
      .select({
        organisationId: organisation.id,
        hubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, organisationId))
      .limit(1),
  )
}

// ═══════════════════════
// 2.3 CRUD :: READ (RELATED)
// ═══════════════════════

/**
 * listUserRoleAssignments operation.
 * Used by project DB workflows to keep persistence behavior centralized.
 */
export const listUserRoleAssignments = async (
  db: Database,
  projectId: string,
): Promise<
  Array<{
    userId: string
    role: string
    capabilities: ProjectRoleDB['capabilities']
  }>
> => {
  return await db
    .select({
      userId: projectRole.userId,
      role: projectRole.role,
      capabilities: projectRole.capabilities,
    })
    .from(projectRole)
    .where(eq(projectRole.projectId, projectId))
}

// ═══════════════════════
// 2.4 CRUD :: READ (LOOKUPS)
// ═══════════════════════

/**
 * Retrieves the project associated with a feature ID.
 * @param db - The database instance.
 * @param featureId - The ID of the feature.
 * @returns The associated project or undefined if not found.
 */
export const getProjectForFeatureId = async (
  db: Database,
  featureId: Id,
): Promise<ProjectDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: true } } },
  })

  return (record?.layer?.project as ProjectDB | undefined) || undefined
}

// ═══════════════════════
// 2.5 CRUD :: READ (MERGING)
// ═══════════════════════

/**
 * mergeOrganisationCapabilities operation.
 * Used by project DB workflows to keep persistence behavior centralized.
 */
export const mergeOrganisationCapabilities = async (
  db: Database,
  organisationId: Id,
  projectCapabilities: unknown,
): Promise<ProjectDB['capabilities']> => {
  const [organisationRow] = await db
    .select({
      capabilities: organisation.capabilities,
    })
    .from(organisation)
    .where(eq(organisation.id, organisationId))
    .limit(1)

  const merged = normalizeProjectCapabilities(projectCapabilities)
  const availableKeys = new Set(
    getCapabilityKeysFromDefinitions(
      organisationRow?.capabilities as CapabilityDefinitions | null | undefined,
    ),
  )

  for (const key of Object.keys(merged)) {
    if (!isProjectCapabilityKey(key)) continue
    if (availableKeys.has(key)) continue
    merged[key] = false
  }

  return merged
}

// ═══════════════════════
// 3.1 CRUD :: UPDATE
// ═══════════════════════

/**
 * Applies partial updates to a project by id.
 * Used by image/media flows that update one field without concurrency metadata.
 * @param db - The database instance.
 * @param data - Partial project fields to update.
 * @param id - Project id.
 * @returns Updated project row.
 */
export const updateProjectById = async (
  db: Database,
  data: ProjectDBPartial,
  id: Id,
): Promise<ProjectDB> => (await update(db, project, data, project.id, id)) as ProjectDB

/**
 * Updates project core fields with optimistic concurrency guard on `modifiedAt`.
 * Used by remote form updates to prevent stale writes.
 * @param db - The database instance.
 * @param params - Update payload including expected `updatedAt`.
 * @returns Updated id/modifiedAt pair, or `null` when stale/missing.
 */
export const updateProjectByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: {
      organisationId: ProjectDB['organisationId']
      code: string
      license?: ProjectDB['license']
      capabilities: ProjectDB['capabilities']
    }
  },
): Promise<{ id: string; modifiedAt: string } | null> => {
  const [updated] = await db
    .update(project)
    .set(params.data)
    .where(and(eq(project.id, params.id), eq(project.modifiedAt, params.updatedAt)))
    .returning({
      id: project.id,
      modifiedAt: project.modifiedAt,
    })

  return updated ?? null
}

/**
 * Toggles published state and publication metadata for a project.
 * @param db - The database instance.
 * @param params - Target id, next publish state, and publisher id.
 * @returns Updated id/state pair or `null`.
 */
export const updateProjectPublishedStateById = async (
  db: Database,
  params: {
    id: Id
    state: boolean
    publisherId: string | null
    publishedAt?: string
    license?: ProjectDB['license']
  },
): Promise<{ id: string; isPublished: boolean } | null> => {
  const publishedAt = params.state
    ? (params.publishedAt ?? new Date().toISOString())
    : null
  const [updated] = await db
    .update(project)
    .set({
      isPublished: params.state,
      publishedAt,
      publisherId: params.state ? params.publisherId : null,
      ...(params.license ? { license: params.license } : {}),
    })
    .where(eq(project.id, params.id))
    .returning({
      id: project.id,
      isPublished: project.isPublished,
    })

  return updated ?? null
}

/**
 * Cascades a project publish-state change into descendant layers and features.
 * Existing local publish snapshots are preserved while an ancestor remains unpublished.
 * @param db - The database instance.
 * @param params - The parent project id and next publish state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeProjectPublishedStateToDescendants = async (
  db: Database,
  params: {
    projectId: Id
    state: boolean
  },
): Promise<void> => {
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
    .where(eq(layer.projectId, params.projectId))

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
    .where(eq(feature.projectId, params.projectId))
}

/**
 * Toggles archived state for a project.
 * @param db - The database instance.
 * @param params - Target id and next archived state.
 * @returns Updated id/state pair or `null`.
 */
export const updateProjectArchivedStateById = async (
  db: Database,
  params: { id: Id; state: boolean },
): Promise<{ id: string; isArchived: boolean } | null> => {
  const [updated] = await db
    .update(project)
    .set({
      isArchived: params.state,
    })
    .where(eq(project.id, params.id))
    .returning({
      id: project.id,
      isArchived: project.isArchived,
    })

  return updated ?? null
}

/**
 * Updates translations for a project by deleting existing ones and creating new ones.
 * @param db - The database instance.
 * @param i18n - Record of translations for each target locale.
 * @param projectId - The project ID.
 * @returns Updated translation rows.
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<LocaleKey, ProjectI18nPartial>,
  projectId: string,
): Promise<ProjectI18nDB[]> => {
  const records = toRelatedRecords(i18n, 'projectId', projectId, 'locale')
  return await replaceManyRelated(
    db,
    projectI18n,
    records as never,
    projectI18n.projectId,
    projectId,
  )
}

// ═══════════════════════
// 3.2 CRUD :: UPDATE (SYNC)
// ═══════════════════════

/**
 * Replaces all project role assignments after ensuring organisation membership.
 * @param db - The database instance.
 * @param userRoles - Persisted project role rows.
 * @param projectId - Target project id.
 * @param organisationId - Parent organisation id.
 * @returns Replaced project role rows.
 */
export const syncUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: Id,
  organisationId: Id,
) => {
  await ensureOrganisationMembership(db, userRoles, organisationId)
  return await replaceManyRelated(
    db,
    projectRole,
    userRoles as ProjectRoleDB[],
    projectRole.projectId,
    projectId,
  )
}

/**
 * Cascades parent organisation id changes to descendant layer/feature/task rows.
 * @param db - The database instance.
 * @param params - Target project and organisation ids.
 */
export const cascadeOrganisationToDescendants = async (
  db: Database,
  params: {
    projectId: Id
    organisationId: Id
  },
): Promise<void> => {
  await db
    .update(layer)
    .set({ organisationId: params.organisationId })
    .where(eq(layer.projectId, params.projectId))

  await db
    .update(feature)
    .set({ organisationId: params.organisationId })
    .where(eq(feature.projectId, params.projectId))

  await db
    .update(task)
    .set({ organisationId: params.organisationId })
    .where(eq(task.projectId, params.projectId))
}

/**
 * Cascades organisation capability restrictions into child projects and project roles.
 * @param db - The database instance.
 * @param params - Organisation id and effective organisation capabilities.
 */
export const cascadeOrganisationCapabilitiesToProjects = async (
  db: Database,
  params: {
    organisationId: Id
    organisationCapabilities: CapabilityDefinitions | null | undefined
  },
): Promise<void> => {
  const allowedKeys = new Set(
    getCapabilityKeysFromDefinitions(params.organisationCapabilities),
  )
  const projectRows = await db
    .select({
      id: project.id,
      capabilities: project.capabilities,
    })
    .from(project)
    .where(eq(project.organisationId, params.organisationId))

  for (const projectRow of projectRows) {
    const nextProjectCapabilities = normalizeProjectCapabilities(
      projectRow.capabilities,
    )
    for (const key of Object.keys(nextProjectCapabilities)) {
      if (!isProjectCapabilityKey(key)) continue
      if (allowedKeys.has(key)) continue
      nextProjectCapabilities[key] = false
    }

    await db
      .update(project)
      .set({ capabilities: nextProjectCapabilities })
      .where(eq(project.id, projectRow.id))

    const projectRoleRows = await db
      .select({
        userId: projectRole.userId,
        capabilities: projectRole.capabilities,
      })
      .from(projectRole)
      .where(eq(projectRole.projectId, projectRow.id))

    for (const roleRow of projectRoleRows) {
      const nextRoleCapabilities = normalizeProjectRoleCapabilities(
        roleRow.capabilities,
      )
      for (const key of Object.keys(nextRoleCapabilities)) {
        if (!isProjectCapabilityKey(key)) continue
        if (nextProjectCapabilities[key]) continue
        nextRoleCapabilities[key] = false
      }

      await db
        .update(projectRole)
        .set({ capabilities: nextRoleCapabilities })
        .where(
          and(
            eq(projectRole.projectId, projectRow.id),
            eq(projectRole.userId, roleRow.userId),
          ),
        )
    }
  }
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
