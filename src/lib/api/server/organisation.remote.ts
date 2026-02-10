// SVELTE
import { getRequestEvent, query } from '$app/server'
// SERVICES
import {
  getOrganisationQueryContext,
  organisationWithRelations,
} from '$lib/api/services/organisation'
import { listOrganisations, toResponseShape } from '$lib/db/services/organisation'
// UTILS
import { setupRequestHandler, getValidQueryParams } from '$lib/api'
// SCHEMA
import { organisation } from '$lib/db/schema'
// SCHEMA
import { ListQueryParamsSchema } from '$lib/db/zod'
import type { OrganisationDB } from '$lib/types'

/**
 * Returns a role-aware organisation collection for remote function callers.
 *
 * @param params - List query params validated by `ListQueryParamsSchema`.
 * @param params.conditions - Optional typed filters for organisation columns.
 * @param params.pagination - Optional pagination controls (`limit`, `offset`).
 * @param params.q - Optional text query applied by the service layer.
 * @returns A promise resolving to organisation records mapped to API response shape.
 * @remarks
 * Validates filter keys against the organisation table and applies default
 * visibility filters via `getValidQueryParams`.
 */
export const getOrganisations = query(ListQueryParamsSchema, async params => {
  // Resolve request context (db, current user, roles, and admin-route detection).
  const event = getRequestEvent()
  const { db, user, userRoles, isAdminRequest } = await setupRequestHandler(event)

  // Validate incoming filter keys against table columns and set default visibility filters.
  const queryParams = getValidQueryParams<OrganisationDB>(
    organisation,
    params.conditions as Partial<OrganisationDB> | undefined,
  )

  // Build final SQL conditions based on request scope and role permissions.
  const { conditions } = getOrganisationQueryContext(
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
    {
      q: params.q,
    },
  )

  // Normalize DB rows to API response shape.
  return Promise.all(
    result.map(organisation =>
      toResponseShape(
        organisation,
        organisation.i18n,
        [],
        true,
        user?.superAdmin || false,
      ),
    ),
  )
})
