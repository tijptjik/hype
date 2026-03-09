// REMOTE
import { guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
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
import { property } from '$lib/db/schema'
import {
  listProperties,
  listResolvedProjectProperties,
  getProperty as loadProperty,
} from '$lib/db/services/property'
import { probeProjectQuery } from '$lib/db/services/project'
// SCHEMA
import { ListQueryParamsSchema, ProjectPropertiesQuery } from '$lib/db/zod'
// ZOD
import { z } from 'zod'
// TYPES
import type { Prisms, PropertyDB, QueryParams } from '$lib/types'

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
// - none

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

  const decisionByProjectId = new Map<
    string,
    Awaited<ReturnType<typeof toProjectReadDecision>>
  >()
  const filteredRows: typeof rows = []
  for (const row of rows) {
    const projectId = row.projectId
    if (!projectId) continue
    if (!decisionByProjectId.has(projectId)) {
      const decision = await toProjectReadDecision({
        db,
        projectId,
        user,
        userRoles,
      })
      decisionByProjectId.set(projectId, decision)
    }
    const decision = decisionByProjectId.get(projectId)
    if (decision?.allowed) filteredRows.push(row)
  }

  return {
    data: filteredRows.map(row => toPropertyResponseShape(row)),
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
