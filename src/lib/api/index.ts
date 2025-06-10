// SVELTE
import { error, json } from '@sveltejs/kit';
// DRIZZLE
import { eq, inArray } from 'drizzle-orm';
// SUPERFORMS
import { superValidate, actionResult } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import type { z } from 'zod';
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib';
import { isOrganisationOrProject } from '$lib/types';
// DB
import client, {
  createJsonPathCondition,
  transformI18nSafely,
  validateTableColumns
} from '$lib/db';
import { mergeFeatureProperties } from '$lib/db/services/feature';
// ENUMS
import { FirstClassResource, ResourcePath, RESERVED_PARAMETERS } from '$lib/enums';
// GUARDS
import { isOrganisation, isProject, isLayer, isFeature } from '$lib/types';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms';
import type { SQL, Table, Column } from 'drizzle-orm';
import type {
  Feature,
  Image,
  Id,
  Layer,
  Prisms,
  Project,
  Property,
  Resource,
  ResourceNew,
  ResourceType,
  Task,
  UserRoleDisco,
  PropertyI18nDB,
  QueryParams,
  LayerPropertyPartialExtra,
  LayerI18nDB,
  FeatureI18nDB,
  OrganisationRoleUser,
  ParamsToSign,
  DeleteParamsToSign,
  SignData,
  Session,
  SessionUser
} from '$lib/types';

export const getSessionOrError = async (
  locals: App.Locals
): Promise<{ user: SessionUser; session: Session }> => {
  if (!locals.session) {
    return error(401, 'Authentication not available');
  }
  if (!locals.user) {
    return error(401, 'No nice, no rice');
  }
  return { user: locals.user, session: locals.session };
};

export const JSONResponseOrError = async (result: any): Promise<any> => {
  if (!result) {
    return error(404, "These aren't the signs you're looking for");
  }
  return json(result);
};

export const SuperFormErrorResponse = (
  resourceType: ResourceType,
  verb: string
): Response => {
  return json(
    {
      type: 'error',
      status: 500,
      error: `Failed to ${verb} ${resourceType}`
    },
    { status: 500 }
  );
};

/**
 * Utility function to handle ZodError logging with formatted output
 */
export const logZodError = (err: any, fallbackMessage: string = 'Error occurred') => {
  if (err && typeof err === 'object' && 'issues' in err) {
    console.error('Validation errors:');
    (err as any).issues.forEach((issue: any) => {
      const path = issue.path ? issue.path.join('.') : 'unknown';
      const expected = issue.expected || 'unknown';
      const received = issue.received || 'unknown';
      console.error(`${issue.message} :: ${path} :: ${expected} -> ${received}`);
    });
  } else {
    console.error(fallbackMessage, err);
  }
};

export const SuperFormResponse = <
  T extends Exclude<Resource, Task> | Exclude<ResourceNew, Task>
>(
  validatedForm: SuperValidated<T>,
  redirect: boolean = false,
  userLosesAccess: boolean = false,
  resourcePath: string = '',
  code: number = 200
): Response => {
  if (!validatedForm.valid) {
    return actionResult<SuperValidated<T>, 'failure'>('failure', validatedForm, {
      status: 400
    });
  }

  if (redirect) {
    if (userLosesAccess) {
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/`, {
        status: 302
      });
    } else {
      // Type-safe property lookup
      const entityRef = getEntityRef(validatedForm.data as Resource);
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/${entityRef}`, {
        status: 303
      });
    }
  }

  return actionResult<SuperValidated<T>, 'success'>('success', validatedForm, {
    status: code
  });
};

// Helper function to get the correct reference property
function getEntityRef<T extends Resource>(resource: T): string {
  if (isOrganisationOrProject(resource)) {
    return resource.code;
  }
  return resource.id!;
}

// ================================================
// ACCESS CHECKS
// ================================================

export const getDatabase = async (
  locals: App.Locals,
  platform: App.Platform | undefined
) => {
  const { user, session } = await getSessionOrError(locals);
  const db = client(platform?.env.DB);
  return {
    db,
    session,
    user,
    userId: user.id as Id,
    userRoles: user.roles as UserRoleDisco[] | []
  };
};

// Client Services

export async function getResponseOrError(request: Response) {
  if (request.status >= 400) {
    const { message } = (await request.json()) as { message: string };
    return error(request.status, message);
  }
  return request.json();
}

const refToResourceType = (ref: string): FirstClassResource => {
  return {
    organisations: 'organisation',
    projects: 'project',
    layers: 'layer',
    features: 'feature',
    tasks: 'task',
    hubs: 'hub'
  }[ref] as FirstClassResource;
};

// Resource configuration mapping
const resourceConfig: Record<
  FirstClassResource | 'hub',
  {
    parentResourceType?: FirstClassResource;
    parentRefKey?: string;
    keyToParent?: string;
  }
> = {
  organisation: {},
  project: {
    parentResourceType: FirstClassResource.organisation,
    parentRefKey: 'code',
    keyToParent: 'organisationId'
  },
  layer: {
    parentResourceType: FirstClassResource.project,
    parentRefKey: 'code',
    keyToParent: 'projectId'
  },
  feature: {
    parentResourceType: FirstClassResource.layer,
    parentRefKey: 'id',
    keyToParent: 'layerId'
  },
  task: {
    parentResourceType: FirstClassResource.feature,
    parentRefKey: 'id',
    keyToParent: 'featureId'
  },
  hub: {}
};

type LoadFormDataOptions<T extends Record<string, unknown>> = {
  entity: string;
  resourcePath: string;
  insertSchema: z.AnyZodObject;
  updateSchema: z.AnyZodObject;
  fetch: typeof fetch;
  user?: SessionUser;
  parentId?: string;
  parentRef?: string;
};

type LoadFormDataResponse<T extends Record<string, unknown>> = Promise<{
  entity: string;
  validatedForm: SuperValidated<T>;
  image?: Image | null;
}>;

// Helper functions for data processing
async function fetchParentResource(
  parentType: FirstClassResource,
  parentRef: string,
  fetch: typeof window.fetch
): Promise<Resource> {
  const response = await fetch(`${API_PATH}/${ResourcePath[parentType]}/${parentRef}`);

  if (!response.ok) {
    throw error(response.status);
  }

  return response.json();
}

async function fetchImage(
  entityId: string,
  fetch: typeof window.fetch
): Promise<Image | null> {
  try {
    const response = await fetch(`${API_PATH}/images/${entityId}`);
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error('Error fetching image:', err);
    return null;
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
  fetch
}: {
  resourceType: FirstClassResource;
  parentId?: string;
  parentRef?: string;
  parentResourceType?: FirstClassResource;
  keyToParent?: string;
  insertSchema: z.AnyZodObject;
  user?: SessionUser;
  fetch: typeof window.fetch;
}): Promise<SuperValidated<T>> {
  // CASE : new resource without parent (e.g. new organisation)
  if (!parentResourceType || !parentId) {
    // @ts-ignore - Complex type handling for organisation user roles
    const form = await superValidate(zod(insertSchema));

    // HANDLE : When creating a new organisation, add the user as the owner
    if (resourceType === 'organisation' && user) {
      // @ts-ignore - Complex type handling for organisation user roles
      form.data.userRoles = [
        {
          userId: user.id,
          role: 'owner',
          user: user
        }
      ];
    }
    return form as SuperValidated<T>;
  }

  // CASE : new resource with parent (e.g. new project)
  if (!parentRef || !keyToParent) {
    throw error(
      400,
      `The jungle teems with the spirits of the dead... Perhaps ${parentResourceType}.${keyToParent} has joined them?`
    );
  }

  // HANDLE : Initialise the form with the insert schema
  // @ts-ignore - Complex type handling for organisation user roles
  const form = await superValidate<T>(zod(insertSchema));
  let initialData: Record<string, any> = {
    ...form.data,
    resourceType
  };

  // EXTEND : Fetch the parent resource
  const parentData = await fetchParentResource(parentResourceType, parentRef, fetch);
  initialData[keyToParent] = parentData.id;

  // CASE : Project parent data based on resource type
  if (isOrganisation(parentData)) {
    initialData = mergeOrganisationRoles(initialData as Project, parentData.userRoles);
    // CASE : Layer
  } else if (isLayer(initialData as Resource) && isProject(parentData)) {
    initialData = mergeProjectProperties(
      initialData as Layer,
      parentData.properties || []
    );
    // CASE : Feature
  } else if (isFeature(initialData as Resource) && isLayer(parentData)) {
    const parentLayerWithCorrectI18n: Layer = {
      ...parentData,
      i18n: (Array.isArray(parentData.i18n)
        ? parentData.i18n
        : Object.values(parentData.i18n || {})) as LayerI18nDB[]
    };

    const initialFeatureWithCorrectI18n: Feature = {
      ...(initialData as Feature),
      i18n: (Array.isArray((initialData as Feature).i18n)
        ? (initialData as Feature).i18n
        : Object.values((initialData as Feature).i18n || {})) as FeatureI18nDB[]
    };

    initialData = mergeFeatureProperties(
      initialFeatureWithCorrectI18n,
      parentLayerWithCorrectI18n
    );
  }

  form.data = initialData as T;
  return form;
}

async function prepareExistingForm<T extends Record<string, unknown>>({
  resourceType,
  entityRef,
  updateSchema,
  fetch
}: {
  resourceType: FirstClassResource;
  entityRef: string;
  updateSchema: z.AnyZodObject;
  fetch: typeof window.fetch;
}): Promise<{
  form: SuperValidated<T>;
  image: Image | null;
}> {
  const response = await fetch(
    `${API_PATH}/${ResourcePath[resourceType]}/${entityRef}`
  );

  if (!response.ok) {
    throw error(response.status);
  }

  const formData = await response.json();
  // @ts-ignore - Complex type handling for organisation user roles
  const form = await superValidate<T>(formData, zod(updateSchema));

  // Fetch image for organisation or project
  const image = await getImageIfNeeded(formData, fetch);

  return { form, image };
}

const getImageIfNeeded = async (formData: any, fetch: typeof window.fetch) => {
  const needsImage = isProject(formData) || isOrganisation(formData);
  return needsImage && formData.imageId
    ? await fetchImage(formData.imageId, fetch)
    : null;
};

export async function loadFormData<T extends Record<string, unknown>>({
  entity,
  resourcePath,
  insertSchema,
  updateSchema,
  fetch,
  user,
  ...options
}: LoadFormDataOptions<T>): LoadFormDataResponse<T> {
  const entityRef = entity || NEW_REF;
  const resourceType = refToResourceType(resourcePath) as FirstClassResource;

  if (entityRef === NEW_REF) {
    const form = await prepareNewForm<T>({
      resourceType,
      parentId: options.parentId,
      parentRef: options.parentRef,
      parentResourceType: resourceConfig[resourceType]?.parentResourceType,
      keyToParent: resourceConfig[resourceType]?.keyToParent,
      insertSchema,
      user,
      fetch
    });

    return {
      entity: entityRef,
      validatedForm: form,
      image: null
    };
  }

  const { form, image } = await prepareExistingForm<T>({
    resourceType,
    entityRef,
    updateSchema,
    fetch
  });

  return {
    entity: entityRef,
    validatedForm: form,
    image
  };
}

function mergeOrganisationRoles(
  project: Project,
  userRoles: OrganisationRoleUser[]
): Project {
  // Get existing maintainer user IDs
  // since it's a new project, there are no existing maintainer user IDs
  const existingUserIds: Id[] = [];

  // Add organization members that aren't already maintainers
  userRoles.forEach((userRole) => {
    if (!existingUserIds.includes(userRole.userId)) {
      project.maintainerRoles.push({
        userId: userRole.userId,
        role: 'member',
        user: {
          id: userRole.userId,
          name: userRole.user.name,
          image: userRole.user.image,
          attribution: userRole.user.attribution
        }
      });
    }
  });
  return project;
}

function mergeProjectProperties(layer: Layer, properties: Property[]): Layer {
  // Get existing property IDs
  // Since it's a new layer, there are no existing property IDs
  const existingPropertyIds: Id[] = (layer.properties || [])
    .map((p) => p.propertyId)
    .filter((id) => id !== undefined) as Id[];

  // Ensure layer.properties is initialized to an array if it's not already
  if (!Array.isArray(layer.properties)) {
    layer.properties = [];
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
        values: projectProp.values || [] // Ensure values is an array
      };

      layer.properties.push({
        layerId: layer.id!, // Assuming layer.id is defined; handle if new layer might not have id
        propertyId: conformedProjectProp.id,
        isVisible: false,
        property: conformedProjectProp
      }) as LayerPropertyPartialExtra;
    }
  });
  return layer;
}

/**
 * Get the query parameters without (1) reserved and (2) excluded parameters
 * @param url - The URL to get the query parameters from
 * @param excludeParams - The parameters to exclude from the query parameters
 * @returns The query parameters without the reserved parameters
 */
export const getQueryParamsWithoutReservedParams = (
  url: URL,
  excludeParams: string[] = []
) => {
  // Get all query parameters except the known reserved (prisms, search, pagination) parameters.
  const params = Array.from(url.searchParams.entries()).filter(
    ([key]) => !RESERVED_PARAMETERS.includes(key) && !excludeParams.includes(key)
  );

  // Reduce the parameters into an object where values are arrays
  return params.reduce(
    (acc, [key, value]) => {
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(value);
      return acc;
    },
    {} as Record<string, string[]>
  );
};

export const isValidQueryParamsOrError = (
  table: any,
  url: URL,
  excludeParams: string[] = []
): QueryParams | Error => {
  const queryParams = getQueryParamsWithoutReservedParams(url, excludeParams);
  const queryParamsKeys = Object.keys(queryParams);

  if (queryParamsKeys.length > 0) {
    // Split the keys into base and nested paths
    const columnPaths = queryParamsKeys.map((key) => ({
      base: key.split('.')[0],
      full: key
    }));

    // Validate only the base columns against the table
    const { valid, invalidColumns } = validateTableColumns(
      table,
      columnPaths.map((path) => path.base)
    );

    if (!valid) {
      return error(
        400,
        `Invalid filter fields: <code>${invalidColumns.join(', ')}</code>`
      );
    }
  }

  return queryParams;
};

export async function loadData<T>({
  entity,
  resourcePath,
  fetch,
  dataKey
}: {
  entity: string | undefined;
  resourcePath: string;
  fetch: typeof globalThis.fetch;
  dataKey: string;
}): Promise<{ [key: string]: T }> {
  if (!entity) {
    throw new Error('Entity ID is required');
  }

  const endPoint = `/api/${resourcePath}/${entity}`;
  const request = await fetch(endPoint);

  if (request.status >= 400) {
    throw new Error(`Failed to fetch data: ${request.statusText}`);
  }

  const entityData: T = await request.json();

  return {
    [dataKey]: entityData
  };
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
  conditions: SQL<any>[]
) => {
  // Only process if there are filters
  if (Object.keys(filters).length === 0) {
    return;
  }

  const filterConditions = Object.entries(filters).map(([column, value]) => {
    // Check if this is a nested path
    const path = column.split('.');

    if (path.length > 1) {
      return createJsonPathCondition(table, path, value);
    }

    // Type assertion to ensure column exists on table and is a Drizzle column
    const tableColumn = table[column as keyof T] as unknown as Column<any, any, any>;

    // Handle Boolean values
    if (Array.isArray(value) && (value[0] === 'true' || value[0] === 'false')) {
      return eq(tableColumn, value[0] === 'true');
    }

    // Handle Array values
    if (Array.isArray(value)) {
      return inArray(tableColumn, value);
    }

    // Handle non-array values
    return eq(tableColumn, value);
  });

  // Only add conditions if we have any
  if (filterConditions.length > 0) {
    conditions.push(...filterConditions);
  }
};

/**
 * Checks if a request came from the admin interface by examining the referer header or request URL
 * @param request - The request to check
 * @returns boolean indicating if the request came from the admin interface
 */
export const isAdminRequest = (request: Request): boolean => {
  // First check the request URL itself
  try {
    const requestUrl = new URL(request.url);
    // If the API request has admin header, treat as admin
    if (request.headers.get('x-admin-request') === 'true') {
      return true;
    }
  } catch {
    // Continue to referer check if URL parsing fails
  }

  // Then check the referer header (original behavior)
  const referer = request.headers.get('referer');
  if (!referer) return false;

  try {
    const refererUrl = new URL(referer);
    return refererUrl.pathname.startsWith(ADMIN_PATH);
  } catch {
    // If the referer is not a valid URL, return false
    return false;
  }
};

/**
 * Removes excluded columns from a query params object
 * @param queryParams - The query params object to remove the excluded columns from
 * @param excludeColumns - The columns to exclude from the query params object
 * @returns The query params object with the excluded columns removed
 */
export const removeExcludedColumns = (
  queryParams: QueryParams,
  excludeColumns: string[]
) => {
  return Object.fromEntries(
    Object.entries(queryParams).filter(([key]) => !excludeColumns.includes(key))
  );
};

/**
 * Get the prisms from the URL
 * @param url - The URL to get the prisms from
 * @returns The prisms
 */
export const getPrisms = (url: URL): Prisms => {
  return {
    organisation: url.searchParams.getAll('organisation') as string[],
    project: url.searchParams.getAll('project') as string[],
    layer: url.searchParams.getAll('layer') as string[]
  };
};

export const getSignedRequest = async (
  eventFetch: typeof fetch,
  paramsToSign: ParamsToSign | DeleteParamsToSign
) => {
  const signResponse = await eventFetch('/api/cloudinary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paramsToSign })
  });

  if (!signResponse.ok) {
    const errorText = await signResponse.text();
    return error(500, `Failed to get Cloudinary signature. ${errorText}`);
  }
  const signData = await signResponse.json();
  if (
    !signData.apikey ||
    !signData.timestamp ||
    !signData.signature ||
    !signData.cloudname
  ) {
    return error(500, 'Invalid signature data for Cloudinary.');
  }
  return signData;
};

export const delFromCloudinary = async (
  eventFetch: typeof fetch,
  signData: SignData,
  publicId: string
) => {
  const destroyResponse = await eventFetch(
    `https://api.cloudinary.com/v1_1/${signData.cloudname}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_id: publicId,
        api_key: signData.apikey,
        timestamp: signData.timestamp,
        signature: signData.signature
      })
    }
  );
  if (!destroyResponse.ok) {
    const destroyJson = await destroyResponse.json();
    console.error('Cloudinary delete failed:', destroyJson.error?.message);
    // Non-critical if it's already deleted, but log and potentially flag
    // For now, we'll allow DB deletion to proceed but this could be stricter
  } else {
    const destroyJson = await destroyResponse.json();
    if (destroyJson.result !== 'ok' && destroyJson.result !== 'not found') {
      console.warn('Cloudinary deletion reported non-standard result:', destroyJson);
      // Potentially flag this, but proceed with DB deletion
    }
  }
};
