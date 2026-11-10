import {
  prepareFeatureIntentPolicySave,
  prepareFeatureNameDependencyChecks,
} from './featureIntentPolicy.js'
import type { FeatureIntentSettingsPatch } from '#lib/features/intents.js'
// IMAGE INTENT POLICY
import { prepareImageIntentPolicySave } from './imageIntentPolicy'
import type { ImageIntentSettingsPatch } from '#lib/images/intents.js'
// INDEX QUERY
import {
  resourceAncestorNameSearchCondition,
  resourceIndexFilterConditions,
  resourceIndexSearchCondition,
} from './resourceIndexFilters.js'
import type { ResourceIndexFilters } from '#lib/resources/indexQuery.js'
import {
  ProjectLocationPolicySchema,
  type ProjectLocationPolicy,
} from '#lib/locations/model.js'
import { gt } from 'drizzle-orm'
// SVELTEKIT
import { error } from '@sveltejs/kit'
// IDENTITY
import { nanoid } from 'nanoid'
// DRIZZLE
import { and, eq, exists, like, or, sql, getTableColumns, type SQL } from 'drizzle-orm'
import { SQL_BATCH_SIZE } from '#lib/utils/batch-query.js'
// CAPABILITIES
import {
  getCapabilityKeysFromDefinitions,
  isProjectCapabilityKey,
  normalizeProjectCapabilities,
} from '#lib/capabilities.js'
// PUBLICATION
import { buildDescendantPublication } from './publication.js'
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
import { prepareGuardedReplacement } from './guardedReplacement.js'
import { prepareProjectMapStyle } from './map.js'
import {
  preparePropertyCatalog,
  prepareProjectInheritedProperties,
  prepareDefaultInheritedProperties,
} from './property.js'
import { prepareAdminResourceRevisionCapture } from './adminResourceRevision.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { InferInsertModel } from 'drizzle-orm'
import { buildOrganisationCapabilityCascade } from './capabilityCascade.js'
// ZOD
import { getProjectHubFilter } from './hub'
// TYPES
import type { OrganisationRevisionActor } from './organisationRevision.js'
import type { CapabilityDefinitions } from '#lib/capabilities.types.js'
import type {
  Id,
  Database,
  LocaleKey,
  Locale,
  ListResponse,
  QueryParams,
} from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
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
} from '#lib/db/zod/schema/project.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1.1 CRUD :: CREATE
//    - createProject
//    - prepareProjectRelations (internal)
//    - createI18n
//    - createUserRoles
//    - commitUserRoles
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
//    - buildProjectCommandScopeGuard
//    - updateProjectArchivedStateById
//    - buildProjectArchivedDescendantUpdates
//    - cascadeProjectArchivedStateToDescendants
//    - buildProjectArchivedDescendantUpdates
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

/** Optional complete project form collections. */
type ProjectRelations = {
  properties?: Parameters<typeof preparePropertyCatalog>[1]
  inheritedProperties?: Parameters<
    typeof prepareProjectInheritedProperties
  >[1]['properties']
  seedInheritedDefaults?: { hubId: string | null; startingRank?: number }
  layers?: Array<{ id: Id; rank: number; isDefaultVisible: boolean }>
  mapStyleCode?: string | null
  i18n?: Record<LocaleKey, ProjectI18nPartial>
  userRoles?: ProjectRoleNew[]
}

/**
 * Prepares project translations, roles, and required organisation memberships.
 * @param db Request database.
 * @param id Authorized project identity.
 * @param organisationId Destination organisation, including an authorized project move.
 * @param relations Complete submitted collections; omitted collections remain intact.
 * @param guard Parent revision predicate checked by every mutation.
 * @returns Unexecuted statements for the parent's transaction.
 * @remarks Existing organisation privileges are never downgraded.
 */
function prepareProjectRelations(
  db: Database,
  id: Id,
  organisationId: Id,
  relations: ProjectRelations,
  guard: SQL,
): BatchItem<'sqlite'>[] {
  const writes: BatchItem<'sqlite'>[] = []
  if (relations.i18n !== undefined)
    writes.push(
      ...prepareGuardedReplacement(
        db,
        projectI18n,
        toRelatedRecords(relations.i18n, 'projectId', id, 'locale') as InferInsertModel<
          typeof projectI18n
        >[],
        projectI18n.projectId,
        id,
        guard,
      ),
    )
  if (relations.userRoles !== undefined) {
    // Provision memberships from one bound JSON list; conflict handling preserves live privileges.
    const userIds = [...new Set(relations.userRoles.map(role => role.userId))]
    if (userIds.length)
      writes.push(
        db
          .insert(organisationRole)
          .select(
            sql`select ${organisationId}, json_extract(value,'$.userId'), case when json_extract(value,'$.role')='user' then 'user' else 'member' end, 0, json_object(${'project:' + id},case when json_extract(value,'$.role')='user' then 'user' else 'member' end) from json_each(${JSON.stringify(relations.userRoles)}) where ${guard}`,
          )
          .onConflictDoUpdate({
            target: [organisationRole.organisationId, organisationRole.userId],
            set: { grant: sql`json_patch(${organisationRole.grant},excluded.grant)` },
          }),
      )
    writes.push(
      ...prepareGuardedReplacement(
        db,
        projectRole,
        relations.userRoles as InferInsertModel<typeof projectRole>[],
        projectRole.projectId,
        id,
        guard,
      ),
    )
  }
  return writes
}

/**
 * Creates a new project in the database.
 * @param db The database instance.
 * @param data The project data to insert.
 * @param relations Optional translations and initial roles.
 * @param actor Authenticated editor for immutable revision attribution.
 * @returns The newly created project.
 * @remarks Submitted roles, parent memberships, translations, map style, property catalog
 * and inherited defaults commit with the project.
 */
export const createProject = async (
  db: Database,
  data: ProjectDBNew,
  relations?: ProjectRelations,
  actor?: OrganisationRevisionActor,
): Promise<ProjectDB> => {
  if (relations || actor) {
    relations ??= {}
    const id = data.id ?? nanoid(12)
    const ownCapture = await prepareAdminResourceRevisionCapture(
      db,
      'project',
      sql`SELECT ${id} AS id`,
      actor,
    )
    const catalog =
      relations.properties !== undefined
        ? await preparePropertyCatalog(
            db,
            relations.properties,
            {
              scope: 'project',
              id,
            },
            actor,
          )
        : null
    // A conflicting parent identity fails before any memberships or relations can change.
    const results = await db.batch([
      ...ownCapture.before,
      db
        .insert(project)
        .values({ ...data, id, isPublished: data.isPublished ?? false })
        .returning(),
      ...prepareProjectRelations(db, id, data.organisationId, relations, sql`1`),
      ...(catalog?.statements ?? []),
      ...(relations.inheritedProperties !== undefined
        ? prepareProjectInheritedProperties(db, {
            projectId: id,
            properties: relations.inheritedProperties,
          })
        : []),
      ...(relations.seedInheritedDefaults
        ? [
            prepareDefaultInheritedProperties(db, {
              projectId: id,
              ...relations.seedInheritedDefaults,
            }),
          ]
        : []),
      ...(relations.mapStyleCode !== undefined
        ? prepareProjectMapStyle(
            db,
            {
              projectId: id,
              projectCode: data.code,
              organisationId: data.organisationId,
              mapStyleCode: relations.mapStyleCode,
            },
            sql`1`,
          )
        : []),
      ...ownCapture.after,
    ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    const created = results[ownCapture.before.length] as ProjectDB[]
    if (!created[0]) throw new Error('Project creation returned no row')
    return created[0] as ProjectDB
  }
  return (await insert(db, project, {
    ...data,
    isPublished: data.isPublished ?? false,
  })) as ProjectDB
}

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
 * Commits project roles and any required parent organisation memberships atomically.
 * @param db - The database instance.
 * @param userRoles - Array of project role rows.
 * @param projectId - Authorized target project id.
 * @param organisationId - The ID of the organisation.
 * @param replace - Whether to replace existing project roles rather than append.
 * @returns Persisted project-role rows.
 * @remarks Existing organisation roles are never downgraded. The live parent lookup
 * and required organisationId column abort nonempty writes if the project moved.
 */
const commitUserRoles = async (
  db: Database,
  userRoles: ProjectRoleNew[],
  projectId: string,
  organisationId: string,
  replace: boolean,
): Promise<ProjectRoleDB[]> => {
  const scope = and(
    eq(project.id, projectId),
    eq(project.organisationId, organisationId),
  )
  const probe = db.select({ id: project.id }).from(project).where(scope).limit(1)
  const parentId = sql`(select ${project.organisationId} from ${project} where ${scope})`

  // Provision missing membership without overwriting existing privileges or racing a prior read.
  const userIds = [...new Set(userRoles.map(role => role.userId))]
  // The parent lookup uses two bindings instead of the organisationId column's usual one.
  const membersPerInsert = Math.max(
    1,
    Math.floor(
      SQL_BATCH_SIZE / (Object.keys(getTableColumns(organisationRole)).length + 1),
    ),
  )
  const memberships = []
  for (let index = 0; index < userIds.length; index += membersPerInsert) {
    memberships.push(
      db
        .insert(organisationRole)
        .values(
          userIds.slice(index, index + membersPerInsert).map(userId => ({
            userId,
            organisationId: parentId,
            role:
              userRoles.find(row => row.userId === userId)?.role === 'user'
                ? ('user' as const)
                : ('member' as const),
            grant: {
              ['project:' + projectId]:
                userRoles.find(row => row.userId === userId)?.role === 'user'
                  ? ('user' as const)
                  : ('member' as const),
            },
          })),
        )
        .onConflictDoUpdate({
          target: [organisationRole.organisationId, organisationRole.userId],
          set: { grant: sql`json_patch(${organisationRole.grant},excluded.grant)` },
        }),
    )
  }

  // Empty replacements must also respect the current project parent before deleting roles.
  const deletions = replace
    ? [
        db
          .delete(projectRole)
          .where(
            and(
              eq(projectRole.projectId, projectId),
              sql`exists (select 1 from ${project} where ${scope})`,
            ),
          ),
      ]
    : []

  // Keep parameter-safe project inserts inside the same transaction as the parent grants.
  const rolesPerInsert = Math.max(
    1,
    Math.floor(SQL_BATCH_SIZE / Object.keys(getTableColumns(projectRole)).length),
  )
  const assignments = []
  for (let index = 0; index < userRoles.length; index += rolesPerInsert) {
    assignments.push(
      db
        .insert(projectRole)
        .values(
          userRoles
            .slice(index, index + rolesPerInsert)
            .map(role => ({ ...role, projectId })),
        )
        .returning(),
    )
  }
  const results = await db.batch([probe, ...memberships, ...deletions, ...assignments])
  if (results[0].length === 0) {
    throw error(404, 'PROJECT_NOT_FOUND')
  }
  return results
    .slice(1 + memberships.length + deletions.length)
    .flat() as ProjectRoleDB[]
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
  return await commitUserRoles(db, userRoles, projectId, organisationId, false)
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
  pagination?: {
    limit?: number
    offset?: number
    afterId?: string
    afterValue?: string | number | null
  },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: {
    q?: string
    indexFilters?: ResourceIndexFilters
    includeCount?: boolean
    countOnly?: boolean
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

  // Index search is literal and shares its predicate with the exact count.
  if (query?.indexFilters) {
    conditions.push(
      ...(await resourceIndexFilterConditions(db, 'project', query.indexFilters)),
    )
    if (query.q) conditions.push(resourceIndexSearchCondition('project', query.q))
  }
  if (query?.q && !query.indexFilters) {
    const search = query.q.toLowerCase()
    const searchColumns = query.searchColumns || ['code', 'name', 'description']
    const searchConditions: SQL<unknown>[] = [
      resourceAncestorNameSearchCondition('project', query.q),
    ]

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

  const countWhere = and(...conditions)
  // Exact totals share authorization predicates but never hydrate list relations.
  if (query?.countOnly) {
    const totals = await db
      .select({ count: sql<number>`count(*)` })
      .from(project)
      .where(countWhere)
    return {
      data: [],
      totalCount: Number(totals[0]?.count ?? 0),
      hasMore: false,
      nextOffset: null,
      offset: 0,
      durationMs: Date.now() - startedAt,
    }
  }
  // Keyset pages advance using a unique immutable ID, independently of row offsets.
  if (pagination?.afterId && pagination.afterValue === undefined)
    conditions.push(gt(project.id, pagination.afterId))
  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const orderBy = toOrderByWithLocalizedFields({
    conditions,
    cursor:
      pagination?.afterId && pagination.afterValue !== undefined
        ? { id: pagination.afterId, value: pagination.afterValue }
        : undefined,
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
    limit: pagination?.limit == null ? undefined : pagination.limit + 1,
    offset: pagination?.offset,
    orderBy,
  } as const

  let data = (await db.query.project.findMany({
    ...baseQuery,
    with: withRelations,
  })) as unknown as TRow[]
  // Count the complete authorized match, never the cursor's remaining suffix.
  const totalRows =
    query?.includeCount === false
      ? null
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(project)
          .where(countWhere)
  const totalCount = totalRows === null ? null : Number(totalRows[0]?.count ?? 0)
  const offset = pagination?.offset ?? 0
  const hasMore = pagination?.limit != null && data.length > pagination.limit
  if (pagination?.limit != null) data = data.slice(0, pagination.limit)
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
  markerStyleCode: ProjectDB['markerStyleCode']
  settings?: ProjectDB['settings']
  flags: ProjectDB['flags']
  cardStyleCode: ProjectDB['cardStyleCode']
  useAllInOrgContext: boolean
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
        useAllInOrgContext: project.useAllInOrgContext,
        flags: project.flags,
        settings: project.settings,
        cardStyleCode: project.cardStyleCode,
        markerStyleCode: project.markerStyleCode,
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
 * Used by remote form updates to prevent stale writes. Optional Location settings are
 * committed in one update, guarded by both Project and policy revisions. Organisation
 * moves include descendant ancestry writes in the same transaction.
 * @remarks Submitted translations, role replacements and required organisation memberships
 * share the revision guard and commit before the parent token advances.
 * @param db - The database instance.
 * @param params - Update payload including expected `updatedAt`.
 * @returns Updated id/modifiedAt pair, or `null` when stale/missing.
 */
export const updateProjectByIdWithConcurrency = async (
  db: Database,
  params: ProjectRelations & {
    id: Id
    actorId?: string
    featureIntentSettings?: FeatureIntentSettingsPatch
    featureNameProperties?: readonly {
      id?: string
      dataType?: string | null
      component?: string | null
      audience?: string | null
    }[]
    imageIntentSettings?: ImageIntentSettingsPatch
    updatedAt: string
    locationUpdatePolicy?: {
      policy: ProjectLocationPolicy
      expectedRevision: number
    }
    data: {
      organisationId: ProjectDB['organisationId']
      code: string
      license?: ProjectDB['license']
      capabilities: ProjectDB['capabilities']
      markerStyleCode: ProjectDB['markerStyleCode']
      settings?: ProjectDB['settings']
      flags: ProjectDB['flags']
      cardStyleCode: ProjectDB['cardStyleCode']
      useAllInOrgContext: boolean
    }
  },
): Promise<{ id: string; modifiedAt: string } | null> => {
  if (params.featureIntentSettings && !params.actorId)
    throw new Error('Feature type settings require an attributed actor')
  const featureSettings =
    params.featureIntentSettings && params.actorId
      ? await prepareFeatureIntentPolicySave(db, {
          ...params.featureIntentSettings,
          scope: { type: 'project', id: params.id },
          actorId: params.actorId,
          nameProperties: params.featureNameProperties,
        })
      : params.featureNameProperties
        ? await prepareFeatureNameDependencyChecks(
            db,
            params.id,
            params.featureNameProperties,
          )
        : []
  if (featureSettings === null) return null
  const settings = params.locationUpdatePolicy
  if (
    settings &&
    (!Number.isSafeInteger(settings.expectedRevision) ||
      settings.expectedRevision < 0 ||
      settings.expectedRevision >= Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error('Invalid policy revision')
  }
  const policy = settings
    ? ProjectLocationPolicySchema.parse(settings.policy)
    : undefined
  // Guard both revisions before updating the Project and its policy; absence is policy revision zero.
  const policyGuard = settings
    ? eq(project.locationPolicyRevision, settings.expectedRevision)
    : undefined
  const revisionGuard = and(
    eq(project.id, params.id),
    eq(project.modifiedAt, params.updatedAt),
    policyGuard,
  )
  // Observe whether ancestry changes, then recheck this revision inside every write.
  const current = await db
    .select({ organisationId: project.organisationId })
    .from(project)
    .where(revisionGuard)
    .get()
  if (!current) return null
  const guardedProject = and(
    revisionGuard,
    eq(project.organisationId, current.organisationId),
  )
  const updateCore = db
    .update(project)
    .set({
      ...params.data,
      ...(settings && policy
        ? {
            locationPolicy: policy,
            locationPolicyRevision: settings.expectedRevision + 1,
          }
        : {}),
    })
    .where(guardedProject)
    .returning({ id: project.id, modifiedAt: project.modifiedAt })

  const moveGuard = exists(
    db.select({ id: project.id }).from(project).where(guardedProject),
  )
  if (params.imageIntentSettings && !params.actorId)
    throw new Error('Image settings require an attributed actor')
  // Include policy and gallery changes in the parent form's guarded transaction.
  const imageSettings = params.imageIntentSettings
    ? await prepareImageIntentPolicySave(db, {
        ...params.imageIntentSettings,
        scope: { type: 'project', id: params.id },
        actorId: params.actorId!,
        guard: moveGuard,
      })
    : []
  if (imageSettings === null) return null
  const writes = prepareProjectRelations(
    db,
    params.id,
    params.data.organisationId,
    params,
    moveGuard,
  )
  if (params.mapStyleCode !== undefined)
    writes.push(
      ...prepareProjectMapStyle(
        db,
        {
          projectId: params.id,
          projectCode: params.data.code,
          organisationId: params.data.organisationId,
          mapStyleCode: params.mapStyleCode,
        },
        moveGuard,
      ),
    )
  if (current.organisationId !== params.data.organisationId) {
    // Keep the parent revision unchanged until every descendant passes its existing scope guards.
    writes.push(
      db
        .update(layer)
        .set({ organisationId: params.data.organisationId })
        .where(and(eq(layer.projectId, params.id), moveGuard)),
      db
        .update(feature)
        .set({ organisationId: params.data.organisationId })
        .where(and(eq(feature.projectId, params.id), moveGuard)),
      db
        .update(task)
        .set({ organisationId: params.data.organisationId })
        .where(and(eq(task.projectId, params.id), moveGuard)),
    )
  }
  const actor = params.actorId ? { actorId: params.actorId } : undefined
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT ${params.id} AS id`,
    actor,
  )
  // Project moves, field assignments and layer ordering can also change layer snapshots.
  const layerCapture = await prepareAdminResourceRevisionCapture(
    db,
    'layer',
    sql`SELECT id FROM layer WHERE projectId=${params.id}`,
    actor,
  )
  if (
    params.properties !== undefined ||
    params.inheritedProperties !== undefined ||
    params.layers !== undefined
  ) {
    const catalog =
      params.properties !== undefined
        ? await preparePropertyCatalog(
            db,
            params.properties,
            {
              scope: 'project',
              id: params.id,
            },
            actor,
          )
        : null
    const beforeCore = [
      ...featureSettings,
      ...imageSettings,
      ...capture.before,
      ...layerCapture.before,
      ...(catalog?.statements ?? []),
      ...writes,
    ]
    const afterCore: BatchItem<'sqlite'>[] = [
      ...(params.inheritedProperties !== undefined
        ? prepareProjectInheritedProperties(db, {
            projectId: params.id,
            properties: params.inheritedProperties,
          })
        : []),
      ...(params.layers ?? []).map(row =>
        db
          .update(layer)
          .set({ rank: row.rank, isDefaultVisible: row.isDefaultVisible })
          .where(and(eq(layer.projectId, params.id), eq(layer.id, row.id))),
      ),
    ]
    // Check the old revision first; resolve inherited scope only after the parent move.
    const statements = [
      ...beforeCore,
      updateCore,
      ...(capture.before.length ? [prepareRevisionCheck(db, sql`changes() = 1`)] : []),
      ...afterCore,
      ...layerCapture.after,
      ...capture.after,
    ]
    const results = await executeRevisionBatch(db, moveGuard, [
      statements[0],
      ...statements.slice(1),
    ])
    if (!results) return null
    const rows = results[beforeCore.length] as { id: string; modifiedAt: string }[]
    return rows[0] ?? null
  }
  const before = [
    ...featureSettings,
    ...imageSettings,
    ...capture.before,
    ...layerCapture.before,
    ...writes,
  ]
  const results = await executeRevisionBatch(db, moveGuard, [
    ...before,
    updateCore,
    ...(capture.before.length ? [prepareRevisionCheck(db, sql`changes() = 1`)] : []),
    ...layerCapture.after,
    ...capture.after,
  ])
  if (!results) return null
  const rows = results[before.length] as { id: string; modifiedAt: string }[]
  return rows[0] ?? null
}

/**
 * Atomically toggles publication for a project, its descendants, and eligible images.
 * @param db - The database instance.
 * @param params - Target id, next publish state, and publisher id.
 * @param params.publishChildren - Explicitly include draft descendants when publishing.
 * @param params.expectedScope - Persisted ancestry used for authorization before this transaction.
 * @param params.expectedLicense Required original license snapshot when replacing license history.
 * @remarks Changed ancestry or license returns null without writes; role grants are not re-read here.
 * @returns Updated id/state pair or `null`; any write failure rolls back the entire hierarchy command.
 */
export const updateProjectPublishedStateById = async (
  db: Database,
  params: {
    id: Id
    actorId?: string
    expectedScope: { organisationId: Id; hubId: string | null }
    state: boolean
    publisherId: string | null
    publishChildren?: boolean
    publishedAt?: string
  } & (
    | { license?: undefined; expectedLicense?: undefined }
    | { license: ProjectDB['license']; expectedLicense: ProjectDB['license'] }
  ),
): Promise<{ id: string; isPublished: boolean } | null> => {
  const actorId = params.actorId ?? params.publisherId
  const actor = actorId ? { actorId, reason: 'Project published state' } : undefined
  const ownCapture = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT ${params.id} AS id`,
    actor,
  )
  const descendants = await prepareAdminResourceRevisionCapture(
    db,
    'layer',
    sql`SELECT id FROM layer WHERE projectId=${params.id}`,
    actor,
  )
  const capture = {
    before: [...ownCapture.before, ...descendants.before],
    after: [...descendants.after, ...ownCapture.after],
  }

  const publishedAt = params.state
    ? (params.publishedAt ?? new Date().toISOString())
    : null
  const parentUpdate = db
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

  // License history is derived from a prior probe; reject replacement of a newer license snapshot.
  const licenseGuard =
    params.license === undefined
      ? sql`1`
      : exists(
          db
            .select({ id: project.id })
            .from(project)
            .where(
              and(
                eq(project.id, params.id),
                sql`json(${project.license}) IS json(${JSON.stringify(params.expectedLicense)})`,
              ),
            ),
        )

  // Commit parent, descendant snapshots, and image policies as one transaction.
  // Recheck the authorized ancestry before any publication writes can execute.
  const results = await executeRevisionBatch(
    db,
    and(buildProjectCommandScopeGuard(db, params), licenseGuard)!,
    [
      ...capture.before,
      parentUpdate,
      // A skipped parent write must not commit descendant publication changes.
      prepareRevisionCheck(db, sql`changes() = 1`),
      ...(await buildDescendantPublication(
        db,
        { kind: 'project', id: params.id },
        params,
      )),
      ...capture.after,
    ],
  )
  return results
    ? ((results[capture.before.length] as { id: string; isPublished: boolean }[])[0] ??
        null)
    : null
}

/**
 * Cascades a project publish-state change into descendant layers and features.
 * Existing local publish snapshots are preserved while an ancestor remains unpublished.
 * @param db - The database instance.
 * @param params - The parent project id and next publish state.
 * @param params.publishChildren - Whether publishing explicitly includes all draft descendants.
 * @param params.publisherId - Actor attributed to explicitly published descendants.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeProjectPublishedStateToDescendants = async (
  db: Database,
  params: {
    projectId: Id
    state: boolean
    publishChildren?: boolean
    publisherId?: Id
  },
): Promise<void> => {
  await db.batch(
    await buildDescendantPublication(
      db,
      { kind: 'project', id: params.projectId },
      params,
    ),
  )
}

/**
 * Rechecks persisted ancestry used to authorize a state command.
 * @param db Request database.
 * @param params Target identity and authorized scope.
 * @returns Transaction predicate requiring unchanged ancestry, including nullable hub identity.
 * @remarks Role grants are not re-read by this scope predicate.
 */
function buildProjectCommandScopeGuard(
  db: Database,
  params: { id: Id; expectedScope: { organisationId: Id; hubId: string | null } },
): SQL {
  return exists(
    db
      .select({ id: project.id })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(
        and(
          eq(project.id, params.id),
          eq(project.organisationId, params.expectedScope.organisationId),
          sql`${organisation.hubId} IS ${params.expectedScope.hubId}`,
        ),
      ),
  )
}

/**
 * Atomically toggles archived state for a project and its descendants.
 * @param db - The database instance.
 * @param params - Target id and next archived state.
 * @param params.expectedScope Ancestry captured before authorization.
 * @remarks Parent and descendant writes roll back together; changed scope returns null.
 * @returns Updated id/state pair or `null`.
 */
export const updateProjectArchivedStateById = async (
  db: Database,
  params: {
    id: Id
    actorId?: string
    state: boolean
    expectedScope: { organisationId: Id; hubId: string | null }
  },
): Promise<{ id: string; isArchived: boolean } | null> => {
  const actorId = params.actorId
  const actor = actorId ? { actorId, reason: 'Project archived state' } : undefined
  const ownCapture = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT ${params.id} AS id`,
    actor,
  )
  const descendants = await prepareAdminResourceRevisionCapture(
    db,
    'layer',
    sql`SELECT id FROM layer WHERE projectId=${params.id}`,
    actor,
  )
  const capture = {
    before: [...ownCapture.before, ...descendants.before],
    after: [...descendants.after, ...ownCapture.after],
  }

  const parentUpdate = db
    .update(project)
    .set({
      isArchived: params.state,
    })
    .where(eq(project.id, params.id))
    .returning({
      id: project.id,
      isArchived: project.isArchived,
    })

  // Commit the parent and descendant snapshots only in the authorized scope.
  const results = await executeRevisionBatch(
    db,
    buildProjectCommandScopeGuard(db, params),
    [
      ...capture.before,
      parentUpdate,
      prepareRevisionCheck(db, sql`changes() = 1`),
      ...buildProjectArchivedDescendantUpdates(db, {
        projectId: params.id,
        state: params.state,
      }),
      ...capture.after,
    ],
  )
  return results
    ? ((results[capture.before.length] as { id: string; isArchived: boolean }[])[0] ??
        null)
    : null
}

/**
 * Cascades a project archive-state change into descendant layers and features.
 * Existing local archive snapshots are preserved while an ancestor remains archived so
 * unarchiving restores the prior descendant state instead of reviving every record.
 *
 * When unarchiving (`state=false`), descendants are only restored from their
 * `localIsArchived` snapshot when the owning organisation is not still archived.
 * If the organisation remains archived, descendants stay archived so that
 * unarchiving a single project cannot revive records hidden by an ancestor.
 *
 * @param db - The database instance.
 * @param params - The parent project id and next archived state.
 * @returns A promise that resolves once descendant rows are updated.
 */
export const cascadeProjectArchivedStateToDescendants = async (
  db: Database,
  params: {
    projectId: Id
    state: boolean
  },
): Promise<void> => {
  await db.batch(buildProjectArchivedDescendantUpdates(db, params))
}

/**
 * Builds descendant updates without executing them, allowing an atomic parent batch.
 * @param db - The database instance.
 * @param params - Project id and requested archive state.
 * @returns Deferred layer and feature updates.
 */
function buildProjectArchivedDescendantUpdates(
  db: Database,
  params: { projectId: Id; state: boolean },
): [BatchItem<'sqlite'>, BatchItem<'sqlite'>] {
  // Preserve descendant archive snapshots until the organisation no longer hides them.
  const layers = db
    .update(layer)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${layer.localIsArchived}, ${layer.isArchived})`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${layer.organisationId}
            ) = 1 then ${layer.localIsArchived}
            else null
          end`,
      isArchived: params.state
        ? sql`1`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${layer.organisationId}
            ) = 1 then 1
            else coalesce(${layer.localIsArchived}, ${layer.isArchived})
          end`,
    })
    .where(eq(layer.projectId, params.projectId))

  const features = db
    .update(feature)
    .set({
      localIsArchived: params.state
        ? sql`coalesce(${feature.localIsArchived}, ${feature.isArchived})`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${feature.organisationId}
            ) = 1 then ${feature.localIsArchived}
            else null
          end`,
      isArchived: params.state
        ? sql`1`
        : sql`case
            when (
              select ${organisation.isArchived}
              from ${organisation}
              where ${organisation.id} = ${feature.organisationId}
            ) = 1 then 1
            else coalesce(${feature.localIsArchived}, ${feature.isArchived})
          end`,
    })
    .where(eq(feature.projectId, params.projectId))
  return [layers, features]
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
 * Atomically replaces project role assignments and ensures organisation membership.
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
): Promise<ProjectRoleDB[]> => {
  return await commitUserRoles(db, userRoles, projectId, organisationId, true)
}

/**
 * Atomically cascades parent organisation id changes to descendant layer/feature/task rows.
 * @param db - The database instance.
 * @param params - Target project and organisation ids.
 * @returns Resolves after all descendant ancestry writes commit together.
 * @remarks Project form moves use updateProjectByIdWithConcurrency to include the parent.
 */
export const cascadeOrganisationToDescendants = async (
  db: Database,
  params: {
    projectId: Id
    organisationId: Id
  },
): Promise<void> => {
  await db.batch([
    db
      .update(layer)
      .set({ organisationId: params.organisationId })
      .where(eq(layer.projectId, params.projectId)),

    db
      .update(feature)
      .set({ organisationId: params.organisationId })
      .where(eq(feature.projectId, params.projectId)),

    db
      .update(task)
      .set({ organisationId: params.organisationId })
      .where(eq(task.projectId, params.projectId)),
  ])
}

/**
 * Cascades organisation capability restrictions into child projects and project roles.
 * @param db - The database instance.
 * @param params - Organisation id and effective organisation capabilities.
 * @returns Resolves when both levels of restrictions commit atomically.
 * @remarks Organisation edits use updateOrganisationByIdWithConcurrency to include the parent.
 */
export const cascadeOrganisationCapabilitiesToProjects = async (
  db: Database,
  params: {
    organisationId: Id
    organisationCapabilities: CapabilityDefinitions | null | undefined
  },
): Promise<void> => {
  await db.batch(
    buildOrganisationCapabilityCascade(
      db,
      params.organisationId,
      params.organisationCapabilities,
    ),
  )
}

// ═══════════════════════
// 4. CRUD :: DELETE
// ═══════════════════════
// No hard delete helpers in this module by design.
