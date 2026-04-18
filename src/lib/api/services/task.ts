// DRIZZLE
import { eq, type SQL, sql } from 'drizzle-orm'
// API
import { applyQueryFilters } from '$lib/api'
import { toBooleanOrUndefined } from '$lib/api/services'
import { isRelevantHubAdmin } from '$lib/api/services/authz'
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrMemberOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier,
} from '$lib/auth/asserts'

// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
// SCHEMA
import { task } from '$lib/db/schema/index'
// DB
import { applyPrismConstraints, transformI18nSafely } from '$lib/db'
import { toNormalizedImageRecord } from '$lib/db/services/image'
// ZOD
import {
  TaskAdminProfileAPI,
  TaskCardProfileAPI,
  TaskDetailProfileAPI,
  TaskListProfileAPI,
} from '$lib/db/zod/schema/task'
// ENUMS
import { HierarchicalResource } from '$lib/enums'
// TYPES
import type {
  Database,
  EntityResponse,
  ListResponse,
  Prisms,
  QueryParams,
  SessionUser,
  Id,
  TaskDB,
  TaskDBRaw,
  UserRoleDisco,
} from '$lib/types'
import type {
  TaskEditorLayerOption,
  TaskEntityByProfile,
  TaskListByProfile,
  TaskProfile,
} from '$lib/db/zod/schema/task.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. COMMON
//    - taskCollectionWithRelations (const)
//    - taskEntityWithRelations (const)
//
// 2. PROFILE SHAPING
//    - toTaskProfile
//    - getTaskWithRelations
//    - toListResponseShape
//    - toEntityResponseShape
//    - toResponseShape
//
// 3. QUERY CONTEXT
//    - toTaskPrisms
//    - toRequestedListState
//    - toQueryConditions
//
// 4. ASSERTIONS
//    - assertPermissionsToCreateTask
//    - assertPermissionsToUpdateTask
//    - assertPermissionsToDeleteTask
//

// ═══════════════════════
// 1. COMMON
// ═══════════════════════

export const taskCollectionWithRelations = {
  organisation: {
    with: {
      i18n: true,
    },
  },
  project: {
    with: {
      i18n: true,
    },
  },
  feature: {
    with: {
      i18n: true,
    },
  },
  images: {
    with: {
      image: true,
    },
  },
  contributor: {
    columns: userColumnsWithPrivacyProtected,
  },
  reviewer: {
    columns: userColumnsWithPrivacyProtected,
  },
}

export const taskEntityWithRelations = {
  ...taskCollectionWithRelations,
  feature: {
    with: {
      i18n: true,
      properties: {
        with: {
          propertyValue: {
            with: {
              i18n: true,
            },
          },
          property: {
            with: {
              i18n: true,
            },
          },
        },
      },
      layer: {
        with: {
          i18n: true,
          project: {
            with: {
              i18n: true,
              organisation: {
                with: {
                  i18n: true,
                },
              },
            },
          },
        },
      },
    },
  },
}

// ═══════════════════════
// 2. PROFILE SHAPING
// ═══════════════════════

const taskProfiles = ['list', 'card', 'detail', 'admin'] as const

type TaskResponseOptions = {
  assignableLayers?: TaskEditorLayerOption[]
  canReassignLayer?: boolean
}

export const toTaskProfile = (value: unknown, fallback: TaskProfile): TaskProfile =>
  typeof value === 'string' && (taskProfiles as readonly string[]).includes(value)
    ? (value as TaskProfile)
    : fallback

export const getTaskWithRelations = (profile: TaskProfile) =>
  profile === 'admin' ? taskEntityWithRelations : taskCollectionWithRelations

/**
 * Shapes a paged task list into the standard list envelope expected by remote callers.
 */
export const toListResponseShape = async <P extends TaskProfile = 'list'>(
  result: ListResponse<TaskDBRaw>,
  profile: P = 'list' as P,
): Promise<ListResponse<TaskListByProfile<P>>> => ({
  ...result,
  data: (await Promise.all(
    result.data.map(taskRow => toResponseShape(taskRow, profile)),
  )) as TaskListByProfile<P>[],
})

export const toEntityResponseShape = async <P extends TaskProfile = 'detail'>(
  row: TaskDBRaw | null,
  profile: P = 'detail' as P,
  options: TaskResponseOptions = {},
): Promise<EntityResponse<TaskEntityByProfile<P>>> => ({
  data: row
    ? ((await toResponseShape(row, profile, options)) as TaskEntityByProfile<P>)
    : null,
})

/**
 * Transform raw task data from database to API response format
 * Converts i18n arrays to locale maps for proper API structure
 */
export const toResponseShape = async <P extends TaskProfile = TaskProfile>(
  data: TaskDBRaw,
  profile: P = 'detail' as P,
  options: TaskResponseOptions = {},
): Promise<TaskEntityByProfile<P>> => {
  // Transform feature properties if they exist
  const transformedFeature = data.feature
    ? {
        ...data.feature,
        i18n: transformI18nSafely(data.feature.i18n),
        properties:
          data.feature.properties?.map(prop => ({
            ...prop,
            property: {
              ...prop.property,
              i18n: transformI18nSafely(prop.property.i18n),
            },
            propertyValue: prop.propertyValue
              ? {
                  ...prop.propertyValue,
                  i18n: transformI18nSafely(prop.propertyValue.i18n),
                }
              : null,
          })) || [],
      }
    : null

  // Transform the complete data structure
  const transformedData = {
    ...data,
    organisation: data.organisation
      ? {
          ...data.organisation,
          i18n: transformI18nSafely(data.organisation.i18n),
        }
      : null,
    project: data.project
      ? {
          ...data.project,
          i18n: transformI18nSafely(data.project.i18n),
        }
      : null,
    feature: transformedFeature,
    images:
      data.images
        ?.filter(taskImage => taskImage.image)
        .map(taskImage => ({
          ...taskImage,
          image: taskImage.image ? toNormalizedImageRecord(taskImage.image) : null,
        })) || [],
    ...(profile === 'admin'
      ? {
          assignableLayers: options.assignableLayers ?? [],
          canReassignLayer: options.canReassignLayer ?? false,
        }
      : {}),
  }

  if (profile === 'admin') {
    return TaskAdminProfileAPI.parse(transformedData) as TaskEntityByProfile<P>
  }
  if (profile === 'detail') {
    return TaskDetailProfileAPI.parse(transformedData) as TaskEntityByProfile<P>
  }
  if (profile === 'card') {
    return TaskCardProfileAPI.parse(transformedData) as TaskEntityByProfile<P>
  }
  return TaskListProfileAPI.parse(transformedData) as TaskEntityByProfile<P>
}

// ═══════════════════════
// 3. QUERY CONTEXT
// ═══════════════════════

export const toTaskPrisms = (prisms?: Prisms): Prisms | undefined => {
  if (!prisms) return undefined

  return {
    organisation: Array.isArray(prisms.organisation) ? prisms.organisation : [],
    project: Array.isArray(prisms.project) ? prisms.project : [],
    layer: [],
  }
}

export const toRequestedListState = (params: Partial<TaskDB>) => ({
  isReviewed: toBooleanOrUndefined(params.isReviewed),
})

export const toQueryConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns: string[] = []
  const organisationIds =
    prisms?.organisation?.filter(
      (organisationId): organisationId is Id =>
        typeof organisationId === 'string' && organisationId.length > 0,
    ) ?? []
  const projectIds =
    prisms?.project?.filter(
      (projectId): projectId is Id =>
        typeof projectId === 'string' && projectId.length > 0,
    ) ?? []

  if (prisms) {
    conditions.push(...applyPrismConstraints(db, HierarchicalResource.task, prisms))
  }

  if (!isAdminRequest) {
    conditions.push(sql`false`)
  } else if (!user.superAdmin && !isRelevantHubAdmin(userRoles, resourceHubId)) {
    if (organisationIds.length === 0 && projectIds.length === 0) {
      conditions.push(sql`false`)
      return { filtersToApply: params, conditions, excludeColumns }
    }

    const ownedOrganisationIds = userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
          role.type === 'organisation' &&
          role.role === 'owner' &&
          typeof role.organisationId === 'string',
      )
      .map(role => role.organisationId as Id)
    const managedProjectIds = userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
          role.type === 'project' &&
          typeof role.projectId === 'string' &&
          (role.role === 'owner' || role.role === 'maintainer'),
      )
      .map(role => role.projectId)

    const allowsOwnedOrganisationScope =
      organisationIds.length > 0 &&
      organisationIds.every(organisationId =>
        ownedOrganisationIds.includes(organisationId),
      )
    const allowsManagedProjectScope =
      projectIds.length > 0 &&
      projectIds.every(projectId => managedProjectIds.includes(projectId))

    if (!allowsOwnedOrganisationScope && !allowsManagedProjectScope) {
      conditions.push(sql`false`)
    }
  }

  if (Object.keys(params).length > 0) {
    applyQueryFilters(task, params, conditions)
  }

  return {
    filtersToApply: params,
    conditions,
    excludeColumns,
  }
}

// ═══════════════════════
// 4. ASSERTIONS
// ═══════════════════════

/**
 * Asserts permissions to create a task.
 * Any logged in user can create a task.
 */
export const assertPermissionsToCreateTask = async (user: SessionUser) => {
  const commonAssertions = [() => assertUserLoggedIn(user)]

  const assertionError = runAssertions(...commonAssertions)
  if (assertionError) return assertionError
}

/**
 * Asserts permissions to update a task.
 * Tasks can be updated by project maintainers or members who have access to the associated project.
 */
export const assertPermissionsToUpdateTask = async (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  taskData?: TaskDB,
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier({ id: params.id }, refId, 'id'),
  ]

  let projectId: Id
  if (taskData?.projectId) {
    projectId = taskData.projectId
  } else {
    const taskRecord = await db.query.task.findFirst({
      where: eq(task.id, params.id as Id),
      columns: { projectId: true },
    })
    if (!taskRecord) {
      throw new Error('Task not found')
    }
    projectId = taskRecord.projectId
  }

  const contextAssertion = () =>
    assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId)

  const assertionError = runAssertions(...commonAssertions, contextAssertion)
  if (assertionError) return assertionError
}

/**
 * Asserts permissions to delete a task.
 * Uses same permissions as update - project maintainers or members.
 */
export const assertPermissionsToDeleteTask = async (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  taskData?: TaskDB,
) => {
  return assertPermissionsToUpdateTask(
    db,
    user,
    request,
    params,
    userRoles,
    refId,
    taskData,
  )
}
