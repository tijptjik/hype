// SVELTE
import { error, json } from '@sveltejs/kit'
// DRIZZLE
import { eq, inArray } from 'drizzle-orm'
// LIB
import { ADMIN_PATH } from '$lib'
// DB
import client, { createJsonPathCondition, validateTableColumns } from '$lib/db'
import { getUserRoles } from '$lib/db/services/user'
// ENUMS
import { RESERVED_PARAMETERS } from '$lib/enums'
// TYPES
import type { SQL, Table } from 'drizzle-orm'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type {
  Id,
  Prisms,
  QueryParams,
  PaginationParams,
  DbTable,
  Session,
  SessionUser,
} from '$lib/types'

export const getSessionOrError = async (
  locals: App.Locals,
): Promise<{ user: SessionUser; session: Session }> => {
  if (!locals.session) {
    return error(401, 'Authentication not available')
  }
  if (!locals.user) {
    return error(401, 'No nice, no rice')
  }
  return { user: locals.user, session: locals.session }
}

export const JSONResponseOrError = async (result: unknown): Promise<Response> => {
  if (!result) {
    return error(404, "These aren't the signs you're looking for")
  }
  return json(result)
}

/**
 * Utility function to handle ZodError logging with formatted output
 */
export const logZodError = (
  err: unknown,
  fallbackMessage: string = 'Error occurred',
) => {
  if (
    err &&
    typeof err === 'object' &&
    'issues' in err &&
    Array.isArray((err as { issues?: unknown }).issues)
  ) {
    console.error('Validation errors:')
    ;(
      err as {
        issues: Array<{
          path?: unknown[]
          expected?: unknown
          received?: unknown
          message?: unknown
        }>
      }
    ).issues.forEach(issue => {
      const path = Array.isArray(issue.path) ? issue.path.join('.') : 'unknown'
      const expected = String(issue.expected ?? 'unknown')
      const received = String(issue.received ?? 'unknown')
      const message = String(issue.message ?? 'Unknown validation issue')
      console.error(`${message} :: ${path} :: ${expected} -> ${received}`)
    })
  } else {
    console.error(fallbackMessage, err)
  }
}

// ================================================
// ACCESS CHECKS
// ================================================

export const setupRequestHandler = async (event: {
  locals: App.Locals
  platform: App.Platform | undefined
  request: Request
}) => {
  const { locals, platform, request } = event
  const { user, session } = await getSessionOrError(locals)
  if (!platform?.env.DB) {
    return error(500, 'Database not available')
  }

  // Get logger setting from platform env
  const enableLogger = platform?.env?.PUBLIC_DRIZZLE_LOGGER === 'true'

  const db = client(platform.env.DB as unknown as MiniflareD1Database, enableLogger)
  const userRoles = await getUserRoles(db, user.id as Id)
  return {
    db,
    session,
    user,
    userId: user.id as Id,
    userRoles,
    isAdminRequest: isAdminRequest(event),
    request,
  }
}

// @deprecated - use setupRequestHandler instead
export const getDatabase = async (
  locals: App.Locals,
  platform: App.Platform | undefined,
) => {
  const { user, session } = await getSessionOrError(locals)
  if (!platform?.env.DB) {
    return error(500, 'Database not available')
  }

  // Get logger setting from platform env
  const enableLogger = platform?.env?.PUBLIC_DRIZZLE_LOGGER === 'true'

  const db = client(platform.env.DB as unknown as MiniflareD1Database, enableLogger)
  const userRoles = await getUserRoles(db, user.id as Id)
  return {
    db,
    session,
    user,
    userId: user.id as Id,
    userRoles,
  }
}

export const getDatabaseWithoutAuth = async (platform: App.Platform | undefined) => {
  if (!platform?.env.DB) {
    return error(500, 'Database not available')
  }
  // Get logger setting from platform env
  const enableLogger = platform?.env?.PUBLIC_DRIZZLE_LOGGER === 'true'

  const db = client(platform.env.DB as unknown as MiniflareD1Database, enableLogger)
  return {
    db,
  }
}

// Client Services

/**
 * Get the query parameters without (1) reserved and (2) excluded parameters
 * @param url - The URL to get the query parameters from
 * @param excludeParams - The parameters to exclude from the query parameters
 * @returns The query parameters without the reserved parameters
 * @deprecated Use getValidQueryParams() for typed argument-based query normalization.
 */
export const getQueryParamsWithoutReservedParams = (
  url: URL,
  excludeParams: string[] = [],
) => {
  // Get all query parameters except the known reserved (prisms, search, pagination) parameters.
  const params = Array.from(url.searchParams.entries()).filter(
    ([key]) => !RESERVED_PARAMETERS.includes(key) && !excludeParams.includes(key),
  )

  // Reduce the parameters into an object where values are arrays
  return params.reduce(
    (acc, [key, value]) => {
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(value)
      return acc
    },
    {} as Record<string, string[]>,
  )
}

/**
 * Build normalized query params from argument objects.
 * Accepts defaults so callers can apply sensible baseline filters.
 */
export const normaliseQueryParams = <TConditions extends Record<string, unknown>>(
  input: Partial<TConditions> | undefined,
  defaults: Partial<TConditions> = {},
  options: { excludeParams?: string[] } = {},
): QueryParams => {
  const excludeParams = options.excludeParams || []

  const addParam = (acc: Record<string, unknown>, key: string, value: unknown) => {
    if (!key || excludeParams.includes(key)) return

    // Input values replace defaults for the same key.
    acc[key] = value
  }

  const merged = {} as Record<string, unknown>
  Object.entries(defaults).forEach(([key, value]) => {
    addParam(merged, key, value)
  })
  Object.entries(input || {}).forEach(([key, value]) => {
    addParam(merged, key, value)
  })
  return merged
}

/**
 * Normalize and validate query params against a Drizzle table schema.
 * @param table - Drizzle table
 * @param input - raw object-like query input
 * @param defaults - default params to apply before input params
 * @param options - normalization options
 * @returns validated query params object
 */
export const getValidQueryParams = <TConditions extends Record<string, unknown>>(
  table: DbTable,
  input?: Partial<TConditions>,
  defaults?: Partial<TConditions>,
  options?: { excludeParams?: string[] },
): QueryParams => {
  const effectiveDefaults =
    defaults ??
    ({
      isPublished: true,
      isArchived: false,
    } as unknown as Partial<TConditions>)

  const queryParams = normaliseQueryParams<TConditions>(
    input,
    effectiveDefaults,
    options ?? {},
  )
  const queryParamsKeys = Object.keys(queryParams)

  if (queryParamsKeys.length > 0) {
    // Validate query keys directly against table columns.
    const { valid, invalidColumns } = validateTableColumns(table, queryParamsKeys)

    if (!valid) {
      return error(
        400,
        `Invalid filter fields: <code>${invalidColumns.join(', ')}</code>`,
      )
    }
  }

  return queryParams
}

/**
 * @deprecated Use getValidQueryParams() instead.
 */
export const isValidQueryParamsOrError = (
  table: DbTable,
  url: URL,
  excludeParams: string[] = [],
): QueryParams => {
  const queryParams = getQueryParamsWithoutReservedParams(url, excludeParams)
  const queryParamsKeys = Object.keys(queryParams)

  if (queryParamsKeys.length > 0) {
    // Split the keys into base and nested paths
    const columnPaths = queryParamsKeys.map(key => ({
      base: key.split('.')[0],
      full: key,
    }))

    // Validate only the base columns against the table
    const { valid, invalidColumns } = validateTableColumns(
      table,
      columnPaths.map(path => path.base),
    )

    if (!valid) {
      return error(
        400,
        `Invalid filter fields: <code>${invalidColumns.join(', ')}</code>`,
      )
    }
  }

  return queryParams
}

/***
 * Apply query filters to a table
 * @param table - The table to apply the filters to
 * @param filters - The filters to apply
 * @param conditions - The conditions to extend
 * @param excludeColumns - The columns to exclude from the conditions - this is used to e.g. protect against public users seeing isArchived and isPublished
 * @returns The extended conditions
 */
export const applyQueryFilters = <T extends Table>(
  table: T,
  filters: QueryParams,
  conditions: SQL<unknown>[],
) => {
  // Only process if there are filters
  if (Object.keys(filters).length === 0) {
    return
  }

  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  const buildNestedJsonConditions = (
    baseColumn: string,
    value: Record<string, unknown>,
    parentPath: string[] = [],
  ): Array<SQL<unknown>> => {
    const nestedConditions: Array<SQL<unknown>> = []

    Object.entries(value).forEach(([key, nestedValue]) => {
      if (nestedValue === undefined) return

      if (isPlainObject(nestedValue)) {
        nestedConditions.push(
          ...buildNestedJsonConditions(baseColumn, nestedValue, [...parentPath, key]),
        )
        return
      }

      nestedConditions.push(
        createJsonPathCondition(table, [baseColumn, ...parentPath, key], nestedValue),
      )
    })

    return nestedConditions
  }

  const filterConditions = Object.entries(filters)
    .flatMap(([column, value]) => {
      if (value === undefined) return undefined

      // TODO Deprecated - Legacy style: dot-separated keys, e.g. "metadata.title".
      const path = column.split('.')
      if (path.length > 1) {
        return createJsonPathCondition(table, path, value)
      }

      // Preferred style: nested object values, e.g. { metadata: { title: '...' } }.
      if (isPlainObject(value)) {
        return buildNestedJsonConditions(column, value)
      }

      // Type assertion to ensure column exists on table and is a Drizzle column
      const tableColumn = table[column as keyof T] as unknownColumn

      // TODO Deprecated - Backward compatibility for deprecated URL-based string booleans.
      if (value === 'true' || value === 'false') {
        return eq(tableColumn, value === 'true')
      }

      // Handle Array values
      if (Array.isArray(value)) {
        if (value.length === 0) return undefined
        // Legacy URL query params are arrays of strings; normalize boolean arrays.
        const normalizedArray = value.map(v => {
          if (v === 'true') return true
          if (v === 'false') return false
          return v
        })

        // Single-value arrays should behave like scalar filters.
        if (normalizedArray.length === 1) {
          return eq(tableColumn, normalizedArray[0])
        }

        return inArray(tableColumn, normalizedArray)
      }

      // Handle non-array values
      return eq(tableColumn, value)
    })
    .filter((condition): condition is SQL<unknown> => condition !== undefined)

  // Only add conditions if we have any
  if (filterConditions.length > 0) {
    conditions.push(...filterConditions)
  }
}

/**
 * Checks if a request/event came from the admin interface.
 * @param requestOrEvent - The request or event to check
 * @returns boolean indicating if the request came from the admin interface
 */
export const isAdminRequest = (
  requestOrEvent:
    | Request
    | {
        request: Request
      },
): boolean => {
  const request =
    requestOrEvent instanceof Request ? requestOrEvent : requestOrEvent.request

  try {
    const requestUrl = new URL(request.url)
    if (
      requestUrl.pathname === ADMIN_PATH ||
      requestUrl.pathname.startsWith(`${ADMIN_PATH}/`)
    ) {
      return true
    }
    // If the API request has admin header, treat as admin
    if (request.headers.get('x-admin-request') === 'true') {
      return true
    }
  } catch {
    // Continue to referer check if URL parsing fails
  }

  // Then check the referer header (original behavior)
  const referer = request.headers.get('referer')
  if (!referer) return false

  try {
    const refererUrl = new URL(referer)
    return refererUrl.pathname.startsWith(ADMIN_PATH)
  } catch {
    // If the referer is not a valid URL, return false
    return false
  }
}

/**
 * Removes excluded columns from a query params object
 * @param queryParams - The query params object to remove the excluded columns from
 * @param excludeColumns - The columns to exclude from the query params object
 * @returns The query params object with the excluded columns removed
 */
export const removeExcludedColumns = (
  queryParams: QueryParams,
  excludeColumns: string[],
) => {
  return Object.fromEntries(
    Object.entries(queryParams).filter(([key]) => !excludeColumns.includes(key)),
  )
}

/**
 * Parses a tri-state boolean-like value.
 * Returns `true`, `false`, `null`, or `undefined` when not coercible.
 */
export const toTriStateBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 1) return true
  if (value === 0) return false
  return undefined
}

/**
 * Produces a deterministic, recursively sorted structure for stable comparisons.
 * @param value Input value to normalize.
 * @returns A recursively normalized value with object keys sorted and `undefined` removed.
 */
export const toStableComparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(item => toStableComparable(item))
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, toStableComparable(item)]),
  )
}

/**
 * Builds a deterministic JSON signature for deep equality-style checks.
 * @param value Input value to serialize.
 * @returns Stable JSON string signature.
 */
export const toStableSignature = (value: unknown): string =>
  JSON.stringify(toStableComparable(value))

/**
 * Get the prisms from the URL
 * @param url - The URL to get the prisms from
 * @returns The prisms
 */
export const getPrisms = (url: URL): Prisms => {
  return {
    organisation: url.searchParams.getAll('organisation') as string[],
    project: url.searchParams.getAll('project') as string[],
    layer: url.searchParams.getAll('layer') as string[],
  }
}

/**
 * Parse and validate pagination options from URL search params.
 */
export const getPaginationOpts = (url: URL): PaginationParams => {
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : null
  const parsedOffset = offsetParam ? Number.parseInt(offsetParam, 10) : null

  return {
    limit:
      parsedLimit !== null && Number.isInteger(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : undefined,
    offset:
      parsedOffset !== null && Number.isInteger(parsedOffset) && parsedOffset >= 0
        ? parsedOffset
        : undefined,
  }
}
