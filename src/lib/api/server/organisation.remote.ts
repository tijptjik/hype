// SVELTE
import { getRequestEvent, query, form, command } from '$app/server'
import { invalid } from '@sveltejs/kit'
// I18N
import { m } from '$lib/i18n'
// DRIZZLE
import { eq } from 'drizzle-orm'
// SERVICES
import {
  toQueryConditions,
  organisationWithRelations,
} from '$lib/api/services/organisation'
import {
  listOrganisations,
  getOrganisation as loadOrganisation,
  updateOrganisationById,
  toEntityResponseShape,
  toListResponseShape,
} from '$lib/db/services/organisation'
// UTILS
import {
  setupRequestHandler,
  getValidQueryParams as validateQueryParams,
} from '$lib/api'
// SCHEMA
import { organisation } from '$lib/db/schema'
// SCHEMA
import {
  ListQueryParamsSchema,
  GetQueryParamsSchema,
  OrganisationFormData,
  PublishOrganisationSchema,
  RemoveOrganisationSchema,
} from '$lib/db/zod'
import type { OrganisationDB, Id } from '$lib/types'

const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<OrganisationDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<OrganisationDB>)
    : ({ id: params.ref as Id } as Partial<OrganisationDB>)

/**
 * Returns a role-aware organisation collection for remote function callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for organisation columns.
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.sortBy - Optional column to sort by.
 * @param params.sortOrder - Optional sort direction (`asc` or `desc`).
 * @param params.q - Optional text query applied by the service layer.
 * @returns A promise resolving to `{ data, limit, offset, totalCount }`.
 * @remarks
 * Validates filter keys against the organisation table and applies default
 * visibility filters via `getValidQueryParams`.
 */
export const getOrganisations = query(ListQueryParamsSchema, async params => {
  // Resolve request context (db, current user, roles, and admin-route detection).
  const event = getRequestEvent()
  const { db, user, userRoles, isAdminRequest } = await setupRequestHandler(event)

  // Validate incoming filter keys against table columns and set default visibility filters.
  const queryParams = validateQueryParams<OrganisationDB>(
    organisation,
    params.conditions as Partial<OrganisationDB> | undefined,
  )

  // Build final SQL conditions based on request scope and role permissions.
  const { conditions, filtersToApply } = toQueryConditions(
    user,
    isAdminRequest,
    queryParams,
    userRoles,
  )

  // Execute list query with optional text search and pagination.
  const result = await listOrganisations(
    db,
    organisationWithRelations,
    conditions,
    event.locals.hub,
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply,
    },
  )

  return toListResponseShape(result, user)
})

/**
 * Returns a role-aware organisation record for remote function callers.
 *
 * @param params - Lookup params validated by `GetQueryParamsSchema`.
 * @param params.ref - Organisation identifier value.
 * @param params.refKey - Optional lookup column (`id` or `code`), defaults to `id`.
 * @returns A promise resolving to `{ data }`, where `data` is the matched organisation.
 * @remarks
 * Validates filter keys against the organisation table and applies default
 * visibility filters via `getValidQueryParams`.
 */
export const getOrganisation = query(GetQueryParamsSchema, async params => {
  try {
    // Resolve request context (db, current user, roles, and admin-route detection).
    const event = getRequestEvent()
    const { db, user, userRoles, isAdminRequest } = await setupRequestHandler(event)

    // Validate incoming filter keys against table columns and set default visibility filters.
    const queryParams = validateQueryParams<OrganisationDB>(
      organisation,
      toLookupConditions(params),
    )

    // Build final SQL conditions based on request scope and role permissions.
    const { conditions } = toQueryConditions(
      user,
      isAdminRequest,
      queryParams,
      userRoles,
    )

    // Execute a single-record query.
    const result = await loadOrganisation(
      db,
      organisationWithRelations,
      conditions,
      event.locals.hub,
    )

    return toEntityResponseShape(result ?? null, user)
  } catch (error) {
    console.error('[remote:getOrganisation] Failed', {
      params,
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
})

export const organisationForm = form(OrganisationFormData, async (params, issue) => {
  if (params.meta?.mode === 'create') {
    const event = getRequestEvent()
    const { db } = await setupRequestHandler(event)

    const existing = await db
      .select({ id: organisation.id })
      .from(organisation)
      .where(eq(organisation.code, params.data.code))
      .limit(1)

    if (existing.length > 0) {
      invalid(issue.data.code(m.admin__validation_code_already_exists()))
    }
  }

  return
})

export const publishOrganisation = command(PublishOrganisationSchema, async params => {
  const event = getRequestEvent()
  const { db } = await setupRequestHandler(event)

  const updated = await updateOrganisationById(
    db,
    { isPublished: params.state },
    params.id as Id,
  )

  return {
    data: {
      id: updated.id,
      isPublished: updated.isPublished,
    },
  }
})

export const removeOrganisation = command(RemoveOrganisationSchema, async params => {
  const event = getRequestEvent()
  const { db } = await setupRequestHandler(event)

  const updated = await updateOrganisationById(
    db,
    { isArchived: params.state },
    params.id as Id,
  )

  return {
    data: {
      id: updated.id,
      isArchived: updated.isArchived,
    },
  }
})
