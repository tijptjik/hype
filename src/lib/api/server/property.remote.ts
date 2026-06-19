// REMOTE
import { guardedCommand, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, inArray } from 'drizzle-orm'
// API
import { getPrisms, getValidQueryParams as validateQueryParams } from '$lib/api'
import {
  getPropertyQueryContext,
  propertyCollectionWithRelations,
  toPropertyPrismConditions,
  toPropertyResponseShape,
} from '$lib/api/services/property'
import { authorizeProjectReadForProbe, toAuthMessage } from '$lib/api/services/authz'
// DB
import { organisation, project, property } from '$lib/db/schema'
import {
  listProperties,
  listResolvedProjectProperties,
  getProperty as loadProperty,
  createBaseProperty,
  createI18n,
  createPropertyValues,
  createPropertyValueI18n,
} from '$lib/db/services/property'
import { probeProjectQuery } from '$lib/db/services/project'
import { retryBusyRead } from '$lib/db/services/sqlite'
// SCHEMA
import {
  ListQueryParamsSchema,
  ProjectPropertiesQuery,
  ProjectPropertyFormData,
} from '$lib/db/zod'
// ZOD
import { z } from 'zod'
// AUTHZ
import { authorizeProjectUpdateForSubmission } from '$lib/api/services/authz'
// TYPES
import type { InferInsertModel } from 'drizzle-orm'
import type { Locale, Prisms, QueryParams } from '$lib/types'
import type {
  Property,
  PropertyDB,
  PropertyI18nNew,
  PropertyValueI18nNew,
  PropertyValueNew,
} from '$lib/db/zod/schema/property.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getProperties
// - getProperty
// - getProjectProperties
//
// FORM
// - none
//
// COMMAND
// - createProjectProperty

/* ----------------- */
// REMOTE FUNCTION REFACTOR
/* -------- */

const PropertyEntityQuery = z.object({
  id: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

const CreateProjectPropertyCommand = z.object({
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
  data: ProjectPropertyFormData,
})

/**
 * Returns whether an unknown database error represents a scoped property-key conflict.
 *
 * @param error - Unknown error thrown by D1/Drizzle.
 * @returns `true` when the error indicates one of the property scoped-key unique indexes.
 */
const isPropertyKeyConflictError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  return (
    message.includes('unique constraint failed') &&
    (message.includes('property.scope, property.projectid, property.key') ||
      message.includes('property_scope_projectid_key_idx') ||
      message.includes('property_scope_organisationid_key_idx') ||
      message.includes('property_scope_hubid_key_idx'))
  )
}

const toProjectReadDecision = async (params: {
  db: Parameters<typeof probeProjectQuery>[0]
  projectId: string
  user: Parameters<typeof authorizeProjectReadForProbe>[0]['user']
  userRoles: Parameters<typeof authorizeProjectReadForProbe>[0]['userRoles']
}) => {
  const probe = await probeProjectQuery(params.db, {
    ref: params.projectId,
    refKey: 'id',
  })
  if (!probe) return null
  return authorizeProjectReadForProbe({
    user: params.user,
    userRoles: params.userRoles,
    probe,
  })
}

/**
 * Resolves project read decisions for a property list in one batched probe query.
 *
 * @param params - DB handle, candidate property rows, and caller auth context.
 * @returns Project read decisions keyed by project id.
 * @remarks
 * Property reads inherit project readability, so list calls only need the minimal
 * project probe shape used by `authorizeProjectReadForProbe`. Batch-loading those
 * probes avoids one extra D1 query per distinct project during app bootstrap.
 */
const toProjectReadDecisionsByProjectId = async (params: {
  db: Parameters<typeof probeProjectQuery>[0]
  rows: Array<{ projectId: string | null }>
  user: Parameters<typeof authorizeProjectReadForProbe>[0]['user']
  userRoles: Parameters<typeof authorizeProjectReadForProbe>[0]['userRoles']
}) => {
  const projectIds = Array.from(
    new Set(
      params.rows
        .map(row => row.projectId)
        .filter((projectId): projectId is string => typeof projectId === 'string'),
    ),
  )

  const decisionsByProjectId = new Map<
    string,
    ReturnType<typeof authorizeProjectReadForProbe>
  >()

  if (projectIds.length === 0) {
    return decisionsByProjectId
  }

  const probes = await retryBusyRead(() =>
    params.db
      .select({
        id: project.id,
        organisationId: project.organisationId,
        hubId: organisation.hubId,
        isPublished: project.isPublished,
        isArchived: project.isArchived,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(inArray(project.id, projectIds)),
  )

  for (const probe of probes) {
    decisionsByProjectId.set(
      probe.id,
      authorizeProjectReadForProbe({
        user: params.user,
        userRoles: params.userRoles,
        probe,
      }),
    )
  }

  return decisionsByProjectId
}

/**
 * Returns a role-aware property collection for guarded remote callers.
 */
const getPropertiesQuery = guardedQuery(ListQueryParamsSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx

  const queryParams = validateQueryParams<PropertyDB>(
    property,
    params.conditions as Partial<PropertyDB> | undefined,
    {},
  )

  const { conditions } = getPropertyQueryContext(
    user,
    event.request,
    queryParams as QueryParams,
    userRoles,
  )

  const scopedConditions = await toPropertyPrismConditions({
    db,
    conditions,
    prisms: ((params.prisms as Prisms | undefined) ?? getPrisms(event.url)) as Prisms,
  })

  const rows = await listProperties(
    db,
    propertyCollectionWithRelations,
    scopedConditions,
  )

  const decisionByProjectId = await toProjectReadDecisionsByProjectId({
    db,
    rows,
    user,
    userRoles,
  })
  const filteredRows: typeof rows = []
  for (const row of rows) {
    const projectId = row.projectId
    if (!projectId) continue
    const decision = decisionByProjectId.get(projectId)
    if (decision?.allowed) filteredRows.push(row)
  }

  // Skip malformed property rows so one bad record does not fail app bootstrap.
  const data = filteredRows.flatMap(row => {
    try {
      return [toPropertyResponseShape(row)]
    } catch (cause) {
      console.error('Property list row failed response shaping', {
        propertyId: row.id,
        projectId: row.projectId,
        cause,
      })
      return []
    }
  })

  return {
    data,
  }
})

export const getProperties = getPropertiesQuery

/**
 * Returns a role-aware single property record for guarded remote callers.
 */
const getPropertyQuery = guardedQuery(PropertyEntityQuery, async (params, ctx) => {
  const { db, user, userRoles } = ctx

  const result = await loadProperty(db, propertyCollectionWithRelations, [
    eq(property.id, params.id),
  ])

  if (!result) {
    return {
      data: null,
    }
  }
  if (typeof result.projectId !== 'string' || result.projectId.length === 0) {
    return {
      data: null,
    }
  }

  const readDecision = await toProjectReadDecision({
    db,
    projectId: result.projectId,
    user,
    userRoles,
  })
  if (!readDecision) {
    return {
      data: null,
    }
  }
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  return {
    data: toPropertyResponseShape(result),
  }
})

export const getProperty = getPropertyQuery

/**
 * Creates one project-scoped property from an import/property creation flow.
 *
 * @param params - Property form payload and explicit remote metadata.
 * @returns The created property in the canonical API response shape.
 * @remarks
 * This intentionally inserts a single property only. It does not call
 * `upsertProjectProperties`, because that helper synchronizes an entire project property
 * collection and would treat omitted project-local properties as deletes.
 */
export const createProjectProperty = guardedCommand(
  CreateProjectPropertyCommand,
  async (params, ctx) => {
    const { db, user, userRoles } = ctx
    const { data } = params

    if (!data.projectId) {
      throw error(400, 'PROJECT_ID_REQUIRED')
    }

    const probe = await probeProjectQuery(db, {
      ref: data.projectId,
      refKey: 'id',
    })
    if (!probe) {
      throw error(404, 'PROJECT_NOT_FOUND')
    }

    const writeDecision = authorizeProjectUpdateForSubmission({
      user,
      userRoles,
      resource: probe,
      submittedData: { properties: [data] },
    })
    if (!writeDecision.allowed) {
      throw error(403, toAuthMessage(writeDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const existingPropertyWithKey = await retryBusyRead(() =>
      db
        .select({ id: property.id })
        .from(property)
        .where(
          and(
            eq(property.scope, 'project'),
            eq(property.projectId, data.projectId),
            eq(property.key, data.key),
          ),
        )
        .limit(1),
    )
    if (existingPropertyWithKey.length > 0) {
      throw error(409, 'PROPERTY_KEY_TAKEN')
    }

    const { i18n, values, rank: _rank, isEnabled: _isEnabled, ...baseProperty } = data
    let createdBase: Awaited<ReturnType<typeof createBaseProperty>>

    try {
      createdBase = await createBaseProperty(db, {
        ...baseProperty,
        projectId: data.projectId,
        hubId: null,
        organisationId: null,
        scope: 'project',
        type: data.type ?? 'specifier',
        isDefaultEnabled: Boolean(data.isDefaultEnabled),
      } as InferInsertModel<typeof property>)
    } catch (createError) {
      if (isPropertyKeyConflictError(createError)) {
        throw error(409, 'PROPERTY_KEY_TAKEN')
      }
      throw createError
    }

    await createI18n(
      db,
      i18n as unknown as Record<Locale, PropertyI18nNew>,
      createdBase.id,
    )

    if (Array.isArray(values) && values.length > 0) {
      const createdValues = await createPropertyValues(
        db,
        values.map(({ i18n: _i18n, ...value }) => value) as PropertyValueNew[],
        createdBase.id,
      )

      for (const [index, createdValue] of createdValues.entries()) {
        const submittedValue = values[index]
        if (!submittedValue?.i18n) continue

        await createPropertyValueI18n(
          db,
          submittedValue.i18n as unknown as Record<Locale, PropertyValueI18nNew>,
          createdValue.id,
        )
      }
    }

    const created = await loadProperty(db, propertyCollectionWithRelations, [
      eq(property.id, createdBase.id),
    ])
    if (!created) {
      throw error(500, 'PROPERTY_CREATE_FAILED')
    }

    return {
      data: toPropertyResponseShape(created) as Property,
    }
  },
)

/**
 * Returns the full property set for a project.
 */
export const getProjectProperties = guardedQuery(
  ProjectPropertiesQuery,
  async (params, ctx) => {
    const { db, user, userRoles, event } = ctx

    const readDecision = await toProjectReadDecision({
      db,
      projectId: params.projectId,
      user,
      userRoles,
    })
    if (!readDecision) {
      return {
        data: [],
      }
    }
    if (!readDecision.allowed) {
      throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    return {
      data: (await listResolvedProjectProperties(db, params.projectId)).sort(
        (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
      ),
      meta: {
        isAdminRequest: ctx.isAdminRequest,
        projectId: params.projectId,
        requestPath: event.url.pathname,
      },
    }
  },
)
