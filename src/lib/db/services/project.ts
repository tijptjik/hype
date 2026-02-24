// DRIZZLE
import {
  and,
  asc,
  desc,
  eq,
  like,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
// SCHEMA
import {
  feature,
  organisation,
  organisationRole,
  project,
  projectI18n,
  projectRole,
} from '../schema'
// AUTH
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
// DB
import { toRelatedRecords, transformI18nSafely } from '..'
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud'
import { toImageEnvelope } from './image'
import { ImageContextResource } from '$lib/enums'
// ZOD
import {
  ProjectAPI,
  ProjectCardProfileAPI,
  ProjectDetailProfileAPI,
  ProjectListProfileAPI,
} from '../zod'
// SERVICES
import { createPropertiesWithRelated, updatePropertiesWithRelated } from './property'
import { getProjectHubFilter } from './hub'
// TYPES
import type {
  ProjectDBNew,
  ProjectDB,
  ProjectI18nDB,
  ProjectI18nNew,
  ProjectI18nPartial,
  Id,
  ProjectRoleNew,
  Project,
  Property,
  PropertyNew,
  Database,
  Locale,
  ProjectNew,
  ProjectDBPartial,
  OrganisationRolePartialExtra,
  ProjectDBRaw,
  ProjectRoleDB,
  PropertyDBRaw,
  ProjectProfile,
  PropertyI18nDB,
  PropertyValueI18nDB,
  PropertyValueDBRaw,
  Code,
  HubOptsExtended,
  ListResponse,
  ProjectListByProfile,
  QueryParams,
  SessionUser,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listProjects
//    - getProject
//    - createProject
//    - updateProject
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createI18n
//    - updateI18n
//    - ensureOrganisationMembership
//    - createProjectUserRoles
//    - updateProjectUserRoles
//
// 3. CRUD :: ORCHESTRATION
//    - createProjectWithRelated
//    - updateProjectWithRelated
//
// 4. ROLES
//    - listProjectUserRoles
//    - mergeOrganisationRoles
//
// 5. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//
// 6. UTILS :: LOOKUPS
//    - getProjectForFeatureId
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

export const listProjects = async (
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
): Promise<ListResponse<ProjectDBRaw>> => {
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
  const sortColumn = project[sortBy as keyof typeof project]
  if (!sortColumn) {
    throw new Error(`Invalid sort column: ${sortBy}`)
  }
  const orderBy =
    sortOrder === 'desc' ? desc(sortColumn as AnyColumn) : asc(sortColumn as AnyColumn)
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const data = await db.query.project.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit,
    offset: pagination?.offset,
    orderBy,
  })
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(project)
  const totalRows = whereClause ? await countQuery.where(whereClause) : await countQuery
  const totalCount = Number(totalRows[0]?.count || 0)
  const offset = pagination?.offset ?? 0
  const hasMore = offset + data.length < totalCount
  const nextOffset = hasMore ? offset + data.length : null
  const durationMs = Date.now() - startedAt

  return {
    data: data as ProjectDBRaw[],
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

export const getProject = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<any | undefined> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getProjectHubFilter(db, opts)
  if (hubFilter) {
    conditions.push(hubFilter)
  }

  return await db.query.project.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })
}

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
  const [probe] = await db
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
    .limit(1)

  return probe ?? null
}

export const probeExistingProject = async (
  db: Database,
  code: string,
): Promise<{ id: string } | null> => {
  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.code, code))
    .limit(1)

  return existing ?? null
}

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
  const [current] = await db
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
    .limit(1)

  return current ?? null
}

export const probeProjectForCommand = async (
  db: Database,
  projectId: Id,
): Promise<{ id: string; organisationId: string; hubId: string | null } | null> => {
  const [current] = await db
    .select({
      id: project.id,
      organisationId: project.organisationId,
      hubId: organisation.hubId,
    })
    .from(project)
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(eq(project.id, projectId))
    .limit(1)

  return current ?? null
}

export const resolveProjectCommandProbe = async (
  db: Database,
  projectId: Id,
  onNotFound: () => never,
): Promise<{ id: string; organisationId: string; hubId: string | null }> => {
  const probed = await probeProjectForCommand(db, projectId)
  if (!probed) return onNotFound()
  return probed
}

export const probeOrganisationHubForProject = async (
  db: Database,
  organisationId: Id,
): Promise<{ organisationId: string; hubId: string | null } | null> => {
  const [row] = await db
    .select({
      organisationId: organisation.id,
      hubId: organisation.hubId,
    })
    .from(organisation)
    .where(eq(organisation.id, organisationId))
    .limit(1)

  return row ?? null
}

/**
 * Creates a new project in the database
 * @param db - The database instance
 * @param data - The project data to insert
 * @returns The newly created project
 * @throws {Error} If the project creation fails
 */
export const createProject = async (
  db: Database,
  data: ProjectDBNew,
): Promise<ProjectDB> =>
  await insert(db, project, {
    ...data,
    isPublished: data.isPublished ?? false,
  })

/**
 * Updates an existing project in the database
 * @param db - The database instance
 * @param data - The updated project data
 * @param ref - The project code reference
 * @returns The updated project
 * @throws {Error} If the project update fails or project is not found
 */
export const updateProject = async (
  db: Database,
  data: ProjectDBPartial,
  ref: Code,
): Promise<ProjectDB> => await update(db, project, data, project.code, ref)

export const updateProjectById = async (
  db: Database,
  data: ProjectDBPartial,
  id: Id,
): Promise<ProjectDB> => await update(db, project, data, project.id, id)

export const updateProjectByIdWithConcurrency = async (
  db: Database,
  params: {
    id: Id
    updatedAt: string
    data: { code: string; capabilities: ProjectDB['capabilities'] }
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

export const updateProjectPublishedStateById = async (
  db: Database,
  params: { id: Id; state: boolean; publisherId: string | null },
): Promise<{ id: string; isPublished: boolean } | null> => {
  const [updated] = await db
    .update(project)
    .set({
      isPublished: params.state,
      publishedAt: params.state ? new Date().toISOString() : null,
      publisherId: params.state ? params.publisherId : null,
    })
    .where(eq(project.id, params.id))
    .returning({
      id: project.id,
      isPublished: project.isPublished,
    })

  return updated ?? null
}

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

/********************
 *  2. CRUD :: RELATIONAL OPERATIONS
 ************/

/**
 * Creates relational i18n records for a project
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param projectId - The ID of the project
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, ProjectI18nNew>,
  projectId: string,
): Promise<ProjectI18nDB[]> => {
  return await insertManyRelated(
    db,
    projectI18n,
    toRelatedRecords(i18n, 'projectId', projectId, 'locale') as any,
    'projectId',
    projectId,
  )
}

/**
 * Updates translations for a project by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param projectId - The ID of the project
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, ProjectI18nPartial>,
  projectId: string,
): Promise<ProjectI18nDB[]> => {
  return await replaceManyRelated(
    db,
    projectI18n,
    toRelatedRecords(i18n, 'projectId', projectId, 'locale') as any,
    projectI18n.projectId,
    projectId,
  )
}

/**
 * Ensures users are added as members to the organisation if they're not already
 * @param db - The database instance
 * @param userRoles - Array of maintainer roles
 * @param organisationId - The ID of the organisation
 */
const ensureOrganisationMembership = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  organisationId: string,
) => {
  // Get existing organization roles
  const orgRoles = await db
    .select({ userId: organisationRole.userId })
    .from(organisationRole)
    .where(eq(organisationRole.organisationId, organisationId))

  const existingOrgUserIds = orgRoles.map(role => role.userId)

  // Find users that need to be added to organization
  const newOrgUsers = userRoles
    .map(role => role.userId)
    .filter(userId => !existingOrgUserIds.includes(userId))

  // Add new users to organization role if needed
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
 * Creates maintainer roles for a project
 * Also ensures that new maintainers are added as members to the parent organisation
 * @param db - The database instance
 * @param userRoles - Array of new maintainer roles to create
 * @param projectId - The ID of the project
 * @param organisationId - The ID of the parent organisation
 * @returns Array of created maintainer roles with associated user information
 */
export const createProjectUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: string,
  organisationId: string,
): Promise<ProjectRoleNew[]> => {
  // Ensure users are members of the organisation
  await ensureOrganisationMembership(db, userRoles, organisationId)

  return await insertManyRelated(
    db,
    projectRole,
    userRoles as ProjectRoleDB[],
    'projectId',
    projectId,
  )
}

export const toPersistedProjectUserRoles = (
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

/**
 * Updates maintainer roles for a project by deleting existing ones and creating new ones
 * Also ensures that new maintainers are added as members to the parent organisation
 * @param db - The database instance
 * @param userRoles - Array of maintainer roles to update
 * @param projectId - The ID of the project
 * @param organisationId - The ID of the parent organisation
 * @returns Array of updated maintainer roles with associated user information
 */
export const updateProjectUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: Id,
  organisationId: Id,
) => {
  // Ensure users are members of the organisation
  await ensureOrganisationMembership(db, userRoles, organisationId)

  // Now proceed with updating project roles
  return await replaceManyRelated(
    db,
    projectRole,
    userRoles as ProjectRoleDB[],
    projectRole.projectId,
    projectId,
  )
}

export const syncProjectUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: Id,
  organisationId: Id,
) => {
  return await updateProjectUserRoles(db, userRoles, projectId, organisationId)
}

// ═══════════════════════
// 3. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new project with translations, maintainer roles, and properties
 * @param db - The database instance
 * @param data - The project data to insert
 * @returns The newly created project with related data
 */
export const createProjectWithRelated = async (db: Database, data: ProjectNew) => {
  const project = await createProject(db, data)
  const i18n = await createI18n(
    db,
    data.i18n as Record<Locale, ProjectI18nNew>,
    project.id,
  )
  await createProjectUserRoles(
    db,
    data.userRoles as ProjectRoleDB[],
    project.id,
    project.organisationId,
  )
  const userRoles = await listProjectUserRoles(db, project.id)

  let properties: Property[] = []
  if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
    properties = await createPropertiesWithRelated(
      db,
      data.properties as PropertyNew[],
      project.id,
    )
  }

  return { ...project, i18n, userRoles, properties }
}

/**
 * Updates a project with translations, maintainer roles, and properties
 * @param db - The database instance
 * @param data - The project data to update
 * @param lookupCode - Optional code to lookup the project (defaults to data.code)
 * @returns The updated project with related data
 */
export const updateProjectWithRelated = async (
  db: Database,
  data: Project,
  lookupCode?: string,
) => {
  const codeToUse = lookupCode || data.code
  const project = await updateProject(db, data, codeToUse)
  const i18n = await updateI18n(db, data.i18n as any, project.id)
  await updateProjectUserRoles(db, data.userRoles, project.id, project.organisationId)
  const userRoles = await listProjectUserRoles(db, project.id)

  let properties: Property[] = []
  // properties can be null in an update if none are sent, or empty array to delete all
  if (data.properties) {
    properties = await updatePropertiesWithRelated(db, data.properties, project.id)
  }

  return { ...project, i18n, userRoles, properties }
}

/**
 * Reads maintainer roles for a project
 * @param db - The database instance
 * @param projectId - The ID of the project
 * @returns Array of maintainer roles with associated user information
 */
export const listProjectUserRoles = async (db: Database, projectId: string) => {
  return await db.query.projectRole.findMany({
    with: {
      user: true,
    },
    where: eq(projectRole.projectId, projectId),
  })
}

// ═══════════════════════
// 4. ROLES
// ═══════════════════════

/**
 * Rebuilds form data from database entities
 * @param project - The project database entity
 * @param translations - Array of project translations
 * @param userRoles - Array of project maintainer roles
 * @param properties - Array of project properties
 * @returns Validated form data
 */
export const toFormShape = async (
  project: ProjectDBRaw,
  i18n: ProjectI18nNew[],
  userRoles: ProjectRoleNew[],
  properties: PropertyNew[],
): Promise<Project> => {
  const normalizedUserRoles = userRoles.map(userRole => ({
    ...userRole,
    capabilities: userRole.capabilities ?? {},
  }))

  const formData: Project = {
    ...project,
    i18n: transformI18nSafely(i18n) as any,
    userRoles: normalizedUserRoles,
    properties: properties
      .sort((a, b) => {
        // Primary sort: 'classifier' before 'specifier'
        if (a.type === 'classifier' && b.type === 'specifier') {
          return -1
        }
        if (a.type === 'specifier' && b.type === 'classifier') {
          return 1
        }
        // Secondary sort: by rank (existing logic)
        return (a.rank ?? 0) - (b.rank ?? 0)
      })
      .map(property => ({
        ...property,
        i18n: transformI18nSafely(property.i18n as PropertyI18nDB[]) as any,
        values: (property.values as PropertyValueDBRaw[]).map(value => ({
          ...value,
          i18n: transformI18nSafely(value.i18n as PropertyValueI18nDB[]) as any,
        })),
      })) as Property[],
    image: project.image
      ? (toImageEnvelope(
          project.image as any,
          'detail',
          ImageContextResource.project,
          project.id,
        ) as any)
      : null,
  }
  return ProjectAPI.parse(formData)
}

/**
 * Builds response data from database entities
 * @param project - The project database entity
 * @param translations - Array of project translations
 * @param userRoles - Array of project maintainer roles
 * @param properties - Array of project properties
 * @returns A parsed response shape
 */
export const toResponseShape = async (
  project: ProjectDBRaw,
  i18n: ProjectI18nNew[] = [],
  userRoles: ProjectRoleNew[] = [],
  properties: PropertyDBRaw[] = [],
  profile: ProjectProfile = 'detail',
) => {
  const imageProfile = profile === 'admin' ? 'admin' : profile
  const normalizedUserRoles = (userRoles ?? []).map(userRole => ({
    ...userRole,
    capabilities: userRole.capabilities ?? {},
  }))
  const data = {
    ...project,
    i18n: transformI18nSafely(i18n ?? []),
    userRoles: normalizedUserRoles,
    properties: (properties ?? []).map((property: PropertyDBRaw) => ({
      ...property,
      i18n: transformI18nSafely(property.i18n),
      values:
        property.values?.map(value => ({
          ...value,
          i18n: transformI18nSafely(value.i18n),
        })) || [],
    })),
    image: project.image
      ? toImageEnvelope(
          project.image as any,
          imageProfile,
          ImageContextResource.project,
          project.id,
        )
      : null,
  }

  if (profile === 'admin') {
    return ProjectAPI.parse(data)
  }
  if (profile === 'detail') {
    return ProjectDetailProfileAPI.parse(data)
  }
  if (profile === 'card') {
    return ProjectCardProfileAPI.parse(data)
  }
  return ProjectListProfileAPI.parse(data)
}

export const toListResponseShape = async <P extends ProjectProfile = 'list'>(
  result: ListResponse<ProjectDBRaw>,
  _user: SessionUser | undefined,
  profile: P = 'list' as P,
): Promise<ListResponse<ProjectListByProfile<P>>> => {
  const {
    data: projects,
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
    projects.map(async project => {
      try {
        return await toResponseShape(
          project,
          project.i18n ?? [],
          project.userRoles ?? [],
          project.properties ?? [],
          profile,
        )
      } catch (err) {
        console.error('[project.toListResponseShape] failed to shape project', {
          projectId: project.id,
          projectCode: project.code,
          profile,
          error: err,
        })
        throw err
      }
    }),
  )

  return {
    data: data as Array<ProjectListByProfile<P>>,
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
// 5. UTILS :: LOOKUPS
// ═══════════════════════

/**
 * Retrieves the project associated with a feature ID
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @returns The associated project or undefined if not found
 */
export const getProjectForFeatureId = async (
  db: Database,
  featureId: Id,
): Promise<ProjectDB | undefined> => {
  const record = await db.query.feature.findFirst({
    where: eq(feature.id, featureId),
    with: { layer: { with: { project: true } } },
  })

  return record?.layer?.project || undefined
}

// ═══════════════════════
// 6. UTILS :: MERGE
// ═══════════════════════

export async function mergeOrganisationRoles(
  db: any,
  result: Project,
): Promise<Project> {
  // Get organization roles for the project's organization
  const orgRoles = await db.query.organisationRole.findMany({
    where: and(eq(organisationRole.organisationId, result.organisationId)),
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected,
      },
    },
  })

  // Get existing maintainer user IDs
  const existingUserIds = result.userRoles.map(userRole => userRole.userId) || []

  // Add organization users that aren't already maintainers
  orgRoles.forEach((orgRole: OrganisationRolePartialExtra) => {
    if (!existingUserIds.includes(orgRole.userId)) {
      result.userRoles.push({
        projectId: result.id,
        userId: orgRole.userId,
        role: 'member',
        user: orgRole.user,
      })
    }
  })

  return result
}
