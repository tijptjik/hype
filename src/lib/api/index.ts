// SVELTE
import { error, json } from '@sveltejs/kit'
// DRIZZLE
import { eq, inArray } from 'drizzle-orm'
// SUPERFORMS
import { superValidate, actionResult } from 'sveltekit-superforms'
// ZOD
import { zod4 as zod } from 'sveltekit-superforms/adapters'
import type { z } from 'zod'
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib'
import { isOrganisationOrProject } from '$lib/types'
// DB
import client, {
  createJsonPathCondition,
  transformI18nSafely,
  validateTableColumns,
} from '$lib/db'
import { mergeFeatureProperties } from '$lib/db/services/feature'
import { getUserRoles } from '$lib/db/services/user'
// ENUMS
import {
  FirstClassResource,
  type HierarchicalResource,
  ResourcePath,
  RESERVED_PARAMETERS,
} from '$lib/enums'
// GUARDS
import { isOrganisation, isProject, isLayer, isFeature } from '$lib/types'
// TYPES
import type { SuperValidated } from 'sveltekit-superforms'
import type { AnyColumn, SQL, Table } from 'drizzle-orm'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type {
  Id,
  Prisms,
  Resource,
  ResourceNew,
  ResourceType,
  Task,
  QueryParams,
  PaginationParams,
  DbTable,
  Session,
  SessionUser,
} from '$lib/types'
import type { Image } from '$lib/db/zod/schema/image.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer, LayerPropertyPartialExtra } from '$lib/db/zod/schema/layer.types'
import type { OrganisationRoleUser } from '$lib/db/zod/schema/organisation.types'

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

export const SuperFormErrorResponse = (
  resourceType: ResourceType,
  verb: string,
): Response => {
  return json(
    {
      type: 'error',
      status: 500,
      error: `Failed to ${verb} ${resourceType}`,
    },
    { status: 500 },
  )
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

export const SuperFormResponse = <
  T extends Exclude<Resource, Task> | Exclude<ResourceNew, Task>,
>(
  validatedForm: SuperValidated<T>,
  redirect: boolean = false,
  userLosesAccess: boolean = false,
  resourcePath: string = '',
  code: number = 200,
): Response => {
  if (!validatedForm.valid) {
    return actionResult<SuperValidated<T>, 'failure'>('failure', validatedForm, {
      status: 400,
    })
  }

  if (redirect) {
    if (userLosesAccess) {
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/`, {
        status: 302,
      })
    } else {
      // Type-safe property lookup
      const entityRef = getResourceRef(validatedForm.data as Resource)
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/${entityRef}`, {
        status: 303,
      })
    }
  }

  return actionResult<SuperValidated<T>, 'success'>('success', validatedForm, {
    status: code,
  })
}

// Helper function to get the correct reference property
function getResourceRef<T extends Resource>(resource: T): string {
  if (isOrganisationOrProject(resource)) {
    return resource.code
  }
  if (typeof resource.id === 'string' && resource.id.length > 0) {
    return resource.id
  }
  throw error(400, 'Resource id is required')
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

export async function getResponseOrError(request: Response) {
  if (request.status >= 400) {
    const { message } = (await request.json()) as { message: string }
    return error(request.status, message)
  }
  return request.json()
}

const refToResourceType = (ref: string): FirstClassResource => {
  return {
    organisations: 'organisation',
    projects: 'project',
    layers: 'layer',
    features: 'feature',
    tasks: 'task',
    hubs: 'hub',
  }[ref] as FirstClassResource
}

// Resource configuration mapping
const resourceConfig: Record<
  FirstClassResource,
  {
    parentResourceType?: FirstClassResource
    parentRefKey?: string
    keyToParent?: string
  }
> = {
  organisation: {},
  project: {
    parentResourceType: FirstClassResource.organisation,
    parentRefKey: 'code',
    keyToParent: 'organisationId',
  },
  layer: {
    parentResourceType: FirstClassResource.project,
    parentRefKey: 'code',
    keyToParent: 'projectId',
  },
  feature: {
    parentResourceType: FirstClassResource.layer,
    parentRefKey: 'id',
    keyToParent: 'layerId',
  },
  task: {
    parentResourceType: FirstClassResource.feature,
    parentRefKey: 'id',
    keyToParent: 'featureId',
  },
  hub: {},
  property: {},
  user: {},
}

type LoadFormDataOptions<T extends Record<string, unknown>> = {
  entity: string
  resourcePath: string
  insertSchema: z.ZodType<T>
  updateSchema: z.ZodType<T>
  fetch: typeof fetch
  user?: SessionUser
  parentId?: string
  parentRef?: string
}

type LoadFormDataResponse<T extends Record<string, unknown>> = Promise<{
  entity: string
  validatedForm: SuperValidated<T>
  image?: Image | null
  images?: Image[] | null
}>

// Helper functions for data processing
async function fetchParentResource(
  parentType: Omit<HierarchicalResource, 'task'>,
  parentRef: string,
  fetch: typeof window.fetch,
): Promise<Resource> {
  const response = await fetch(
    `${API_PATH}/${ResourcePath[parentType as keyof typeof ResourcePath]}/${parentRef}`,
  )

  if (!response.ok) {
    throw error(response.status)
  }

  return response.json()
}

async function fetchImage(
  entityId: string,
  fetch: typeof window.fetch,
): Promise<Image | null> {
  try {
    const response = await fetch(`${API_PATH}/images/${entityId}`)
    return response.ok ? await response.json() : null
  } catch (err) {
    console.error('Error fetching image:', err)
    return null
  }
}

async function prepareNewForm<T extends Record<string, unknown>>({
  resourceType,
  parentId,
  parentRef,
  parentResourceType,
  keyToParent,
  insertSchema,
  user,
  fetch,
}: {
  resourceType: HierarchicalResource
  parentId?: string
  parentRef?: string
  parentResourceType?: Omit<HierarchicalResource, 'task'>
  keyToParent?: string
  insertSchema: z.ZodType<T>
  user?: SessionUser
  fetch: typeof window.fetch
}): Promise<SuperValidated<T>> {
  // CASE : new resource without parent (e.g. new organisation)
  if (!parentResourceType || !parentId) {
    // @ts-expect-error - Complex type handling for organisation user roles
    const form = await superValidate(zod(insertSchema))

    // HANDLE : When creating a new organisation, add the user as the owner
    if (resourceType === 'organisation' && user) {
      // @ts-expect-error - Complex type handling for organisation user roles
      form.data.userRoles = [
        {
          userId: user.id,
          role: 'owner',
          user: user,
        },
      ]
    }
    return form as SuperValidated<T>
  }

  // CASE : new resource with parent (e.g. new project)
  if (!parentRef || !keyToParent) {
    throw error(
      400,
      `The jungle teems with the spirits of the dead... Perhaps ${parentResourceType}.${keyToParent} has joined them?`,
    )
  }

  // HANDLE : Initialise the form with the insert schema
  // @ts-expect-error - Complex type handling for organisation user roles
  const form = await superValidate<T>(zod(insertSchema))
  let initialData: Record<string, unknown> = {
    ...form.data,
    resourceType,
  }

  // EXTEND : Fetch the parent resource
  const parentData = await fetchParentResource(parentResourceType, parentRef, fetch)
  initialData[keyToParent] = parentData.id

  // CASE : Project parent data based on resource type
  if (isOrganisation(parentData)) {
    initialData = mergeOrganisationRoles(initialData as Project, parentData.userRoles)
    // CASE : Layer
  } else if (isLayer(initialData as Resource) && isProject(parentData)) {
    // Inject organisationId from project
    initialData.organisationId = parentData.organisationId
    initialData = mergeProjectProperties(
      initialData as Layer,
      parentData.properties || [],
    )
    // CASE : Feature
  } else if (isFeature(initialData as Resource) && isLayer(parentData)) {
    // Inject organisationId and projectId from layer
    initialData.organisationId = parentData.organisationId
    initialData.projectId = parentData.projectId

    const parentLayerWithCorrectI18n: Layer = {
      ...parentData,
      i18n: transformI18nSafely(parentData.i18n),
      properties: parentData.properties || [], // Ensure properties exist
    }

    const initialFeatureWithCorrectI18n: Feature = {
      ...(initialData as Feature),
      i18n: transformI18nSafely((initialData as Feature).i18n, {}),
    }

    initialData = mergeFeatureProperties(
      initialFeatureWithCorrectI18n,
      parentLayerWithCorrectI18n,
    )
  }

  form.data = initialData as T
  return form
}

async function prepareExistingForm<T extends Record<string, unknown>>({
  resourceType,
  entityRef,
  updateSchema,
  fetch,
}: {
  resourceType: HierarchicalResource
  entityRef: string
  updateSchema: z.ZodType<T>
  fetch: typeof window.fetch
}): Promise<{
  form: SuperValidated<T>
  image: Image | null
  images: Image[] | null
}> {
  const response = await fetch(
    `${API_PATH}/${ResourcePath[resourceType]}/${entityRef}`,
    {
      headers: {
        'x-admin-request': 'true',
      },
    },
  )

  if (!response.ok) {
    throw error(response.status)
  }

  const formData = await response.json()
  // @ts-expect-error - Complex type handling for organisation user roles
  const form = await superValidate<T>(formData, zod(updateSchema))

  // Fetch image for organisation or project
  const { image, images } = await getImageIfNeeded(formData, fetch)

  return { form, image, images }
}

const getImageIfNeeded = async (
  formData: unknown,
  fetch: typeof window.fetch,
): Promise<{ image: Image | null; images: Image[] | null }> => {
  const hasImages = isFeature(formData)
  const needsImage = isProject(formData) || isOrganisation(formData)
  const record =
    typeof formData === 'object' && formData !== null
      ? (formData as { image?: unknown; images?: unknown; imageId?: unknown })
      : {}

  const imageId =
    typeof record.imageId === 'string' && record.imageId.length > 0
      ? record.imageId
      : null

  return {
    image: (hasImages && record.image !== undefined
      ? (record.image as Image)
      : needsImage && imageId
        ? await fetchImage(imageId, fetch)
        : null) as Image | null,
    images: (hasImages && Array.isArray(record.images) ? record.images : null) as
      | Image[]
      | null,
  }
}

/**
 * @deprecated Use resource-specific remote form loaders instead of the generic API form loader.
 */
export async function loadFormData<T extends Record<string, unknown>>({
  entity,
  resourcePath,
  insertSchema,
  updateSchema,
  fetch,
  user,
  ...options
}: LoadFormDataOptions<T>): LoadFormDataResponse<T> {
  const entityRef = entity || NEW_REF
  const resourceType = refToResourceType(
    resourcePath,
  ) as unknown as HierarchicalResource

  if (entityRef === NEW_REF) {
    const form = await prepareNewForm<T>({
      resourceType,
      parentId: options.parentId,
      parentRef: options.parentRef,
      parentResourceType: resourceConfig[resourceType]?.parentResourceType,
      keyToParent: resourceConfig[resourceType]?.keyToParent,
      insertSchema,
      user,
      fetch,
    })

    return {
      entity: entityRef,
      validatedForm: form,
      image: null,
    }
  }

  const { form, image, images } = await prepareExistingForm<T>({
    resourceType,
    entityRef,
    updateSchema,
    fetch,
  })

  return {
    entity: entityRef,
    validatedForm: form,
    image,
    images,
  }
}

function mergeOrganisationRoles(
  project: Project,
  userRoles: OrganisationRoleUser[],
): Project {
  // Get existing maintainer user IDs
  // since it's a new project, there are no existing maintainer user IDs
  const existingUserIds: Id[] = []

  // Add organization members that aren't already maintainers
  userRoles.forEach(userRole => {
    if (!existingUserIds.includes(userRole.userId)) {
      project.userRoles.push({
        userId: userRole.userId,
        role: 'member',
        user: {
          id: userRole.userId,
          name: userRole.user.name,
          image: userRole.user.image,
          attribution: userRole.user.attribution,
        },
      })
    }
  })
  return project
}

function mergeProjectProperties(layer: Layer, properties: Property[]): Layer {
  // Get existing property IDs
  // Since it's a new layer, there are no existing property IDs
  const existingPropertyIds: Id[] = (layer.properties || [])
    .map(p => p.propertyId)
    .filter(id => id !== undefined) as Id[]

  // Ensure layer.properties is initialized to an array if it's not already
  if (!Array.isArray(layer.properties)) {
    layer.properties = []
  }

  // Add project properties that aren't already in the layer
  properties.forEach((projectProp: Property) => {
    if (!existingPropertyIds.includes(projectProp.id)) {
      if (typeof projectProp.i18n !== 'object' && projectProp.i18n) {
        projectProp.i18n = transformI18nSafely(projectProp.i18n)
      }
      // Create a conformed property object
      const conformedProjectProp: Property = {
        ...projectProp,
        values: projectProp.values || [], // Ensure values is an array
      }

      layer.properties.push({
        layerId: layer.id ?? NEW_REF,
        propertyId: conformedProjectProp.id,
        isVisible: false,
        property: conformedProjectProp,
      }) as LayerPropertyPartialExtra
    }
  })
  return layer
}

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

export async function loadData<T>({
  entity,
  resourcePath,
  fetch,
  dataKey,
}: {
  entity: string | undefined
  resourcePath: string
  fetch: typeof globalThis.fetch
  dataKey: string
}): Promise<{ [key: string]: T }> {
  if (!entity) {
    throw new Error('Entity ID is required')
  }

  const endPoint = `/api/${resourcePath}/${entity}`
  const request = await fetch(endPoint)

  if (request.status >= 400) {
    throw new Error(`Failed to fetch data: ${request.statusText}`)
  }

  const entityData: T = await request.json()

  return {
    [dataKey]: entityData,
  }
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
