// SVELTE
import { error, json } from '@sveltejs/kit';
// SUPERFORMS
import { superValidate, actionResult } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
// LIB
import { ADMIN_PATH, API_PATH, NEW_REF } from '$lib';
// DB
import { getUserRoles } from '$lib/auth/utils';
import client, { toNestedTranslations, validateTableColumns } from '$lib/db';
import { mergeFeatureProperties } from '$lib/db/services/feature';
// ENUMS
import {
  publicAccessOptions,
  hierarchicalOwnOptions,
  hierarchicalChildrenOptions,
  hierarchicalGrandChildrenOptions,
  relationalAccessOptions,
  genericAccessOptions,
  HierarchicalResource,
  HierarchicalResourcePath
} from '$lib/types';
// TYPES
import type {
  AccessStrategyOption,
  Feature,
  GetImageAPI,
  Id,
  Layer,
  Organisation,
  OrganisationRole,
  Project,
  Property,
  PropertyI18n,
  Resource,
  ResourceType,
  StatefulAccessOption
} from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';
import type { UserRole } from '$lib/auth/utils';
import type { Session } from '@auth/core/types';
import type { z } from 'zod';

export const getSessionOrError = async (locals: App.Locals) => {
  const session = await locals.auth();
  if (!session?.user) {
    return error(401, 'No nice, no rice');
  }
  return session;
};

export const JSONResponseOrError = async (result: any): Promise<any> => {
  if (!result) {
    return error(404, "These aren't the signs you're looking for");
  }
  return json(result);
};

export const SuperFormErrorResponse = (resourceType: string): Response => {
  return json(
    {
      type: 'error',
      status: 500,
      error: `Failed to update ${resourceType}`
    },
    { status: 500 }
  );
};

export const SuperFormResponse = <T extends Resource>(
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
      const entityRef = getEntityRef(validatedForm.data);
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
  return resource.id;
}

// Type guard to narrow the type
function isOrganisationOrProject(
  resource: Resource
): resource is Organisation | Project {
  return 'code' in resource;
}

// Type guards for resource types
function isOrganisation(resource: Resource): resource is Organisation {
  return (
    !('organisationId' in resource) &&
    !('layerId' in resource) &&
    !('featureId' in resource) &&
    !('projectId' in resource) &&
    'userRoles' in resource
  );
}

// Type guards for resource types
function isProject(resource: Resource): resource is Project {
  return 'organisationId' in resource;
}

function isLayer(resource: Resource): resource is Layer {
  return 'projectId' in resource;
}

function isFeature(resource: Resource): resource is Feature {
  return 'layerId' in resource;
}

const checkAccessOrError = (
  userRoles: UserRole[],
  strategy: AccessStrategyOption,
  resourceType: string = 'EVERYTHING'
) => {
  let hasAccess = false;

  const resourceOwnership = {
    layer: 'project',
    project: 'organisation',
    feature: 'layer',
    image: 'project',
    task: 'project',
    user: 'user'
  };

  // Check each strategy until we find one that grants access
  if (publicAccessOptions.includes(strategy)) {
    hasAccess = true;
  } else if (genericAccessOptions.includes(strategy)) {
    if (userRoles.some((role) => role.type === resourceType)) {
      hasAccess = true;
    }
  } else if (hierarchicalOwnOptions.includes(strategy)) {
    if (userRoles.some((role) => role.type === resourceType)) {
      hasAccess = true;
    }
  } else if (
    hierarchicalChildrenOptions.includes(strategy) ||
    relationalAccessOptions.includes(strategy)
  ) {
    const parentResourceType =
      resourceOwnership[resourceType as keyof typeof resourceOwnership];
    if (userRoles.some((role) => role.type === parentResourceType)) {
      hasAccess = true;
    }
  } else if (hierarchicalGrandChildrenOptions.includes(strategy)) {
    const parentResourceType =
      resourceOwnership[resourceType as keyof typeof resourceOwnership];
    const grandParentResourceType =
      resourceOwnership[parentResourceType as keyof typeof resourceOwnership];
    if (userRoles.some((role) => role.type === grandParentResourceType)) {
      hasAccess = true;
    }
  }
  if (!hasAccess) {
    return error(401, `All out of <code>${resourceType}</code>s to give`);
  }
  return hasAccess;
};

export const getDatabaseOrError = async (
  locals: App.Locals,
  platform: App.Platform | undefined,
  accessStrategy: AccessStrategyOption,
  resourceType?: ResourceType,
  refId?: string,
  checkFeatureAccess?: (
    db: any,
    userId: Id,
    refId: Id
  ) => Promise<{ organisationId: Id; role: string } | undefined>,
  checkProjectAccess?: (
    db: any,
    userId: Id,
    refId: Id
  ) => Promise<{ projectId: Id; role: string | null } | undefined>,
  checkOrganisationAccess?: (
    db: any,
    userId: Id,
    refId: Id
  ) => Promise<{ organisationId: Id; role: string } | undefined>,
  privilegedStrategy: StatefulAccessOption | null = null,
  resourceOwner?: ResourceType
) => {
  // Checks whether the user is logged in
  const session = await getSessionOrError(locals);
  // Connects to the database
  const db = client(platform?.env.DB);
  // Gets the user's roles
  const userRoles = await getUserRoles(db, session.user.id);

  // TODO Add SuperAdmin to User Table
  if (session.user.superAdmin === true) {
    accessStrategy = 'SuperAdmin';
  }

  // Check whether privileges should be escalated
  if (genericAccessOptions.includes(accessStrategy)) {
    if (
      (accessStrategy === 'GenericSelf' || accessStrategy === 'GenericOwn') &&
      session.user.id !== refId
    ) {
      error(403, "Get real - you not touchin' this");
    }
  } else {
    checkAccessOrError(userRoles, accessStrategy, resourceType);
  }

  if (
    accessStrategy == 'EntityFromEditableProject' ||
    accessStrategy == 'ResourceFromEditableProject'
  ) {
    if (!refId || (!checkProjectAccess && !checkOrganisationAccess)) {
      error(
        400,
        'Project ID and either checkProjectAccess or checkOrganisationAccess is required'
      );
    }
    if (resourceOwner === 'organisation') {
      const organisationAccess = await checkOrganisationAccess?.(
        db,
        session.user.id,
        refId
      );
      // Upgrade access strategy if project access is found and stateful strategy is provided
      if (organisationAccess?.role && privilegedStrategy !== null) {
        accessStrategy = privilegedStrategy;
      } else {
        error(404, 'organisationAccess goes brrrr');
      }
    } else if (resourceOwner === 'project') {
      const projectAccess = await checkProjectAccess?.(db, session.user.id, refId);
      // Upgrade access strategy if project access is found and stateful strategy is provided
      if (projectAccess?.role && privilegedStrategy !== null) {
        accessStrategy = privilegedStrategy;
      } else {
        error(404, 'ProjectAccess goes brrrr');
      }
    } else if (resourceOwner === 'feature') {
      const featureAccess = await checkFeatureAccess?.(db, session.user.id, refId);
      if (featureAccess?.role && privilegedStrategy !== null) {
        accessStrategy = privilegedStrategy;
      } else {
        error(404, 'ProjectAccess for feature goes brrrr');
      }
    } else {
      error(404, `ResourceOwner ${resourceOwner}? Ha! That's a no from me dawg`);
    }
  }
  // ORGANISATION ACCESS CHECK
  else if (
    accessStrategy == 'EntityFromEditableOrganisation' ||
    accessStrategy == 'ResourceFromEditableOrganisation'
  ) {
    if (!refId || !checkOrganisationAccess) {
      error(400, 'Organisation ID or checkOrganisationAccess function is required');
    }
    const organisationAccess = await checkOrganisationAccess(
      db,
      session.user.id,
      refId
    );

    // Upgrade access strategy if project access is found and stateful strategy is provided
    if (organisationAccess?.role && privilegedStrategy !== null) {
      accessStrategy = privilegedStrategy;
    } else {
      error(404, 'OrganisationAccess goes brrrr');
    }
  }

  return {
    db,
    session,
    userId: session.user.id,
    userRoles,
    accessStrategy
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

const refToResourceType = (ref: string): ResourceType => {
  return {
    organisations: 'organisation',
    projects: 'project',
    layers: 'layer',
    features: 'feature'
  }[ref] as ResourceType;
};

// Resource configuration mapping
const resourceConfig: Record<
  HierarchicalResource,
  {
    parentResourceType?: HierarchicalResource;
    parentRefKey?: string;
    keyToParent?: string;
  }
> = {
  organisation: {},
  project: {
    parentResourceType: HierarchicalResource.organisation,
    parentRefKey: 'code',
    keyToParent: 'organisationId'
  },
  layer: {
    parentResourceType: HierarchicalResource.project,
    parentRefKey: 'code',
    keyToParent: 'projectId'
  },
  feature: {
    parentResourceType: HierarchicalResource.layer,
    parentRefKey: 'id',
    keyToParent: 'layerId'
  },
  task: {
    parentResourceType: HierarchicalResource.feature,
    parentRefKey: 'id',
    keyToParent: 'featureId'
  }
};

type LoadFormDataOptions<T> = {
  entity: string;
  resourcePath: string;
  insertSchema: any;
  updateSchema: any;
  fetch: typeof fetch;
  session?: Session;
  parentId?: string;
  parentRef?: string;
};

type LoadFormDataResponse<T extends Record<string, unknown>> = Promise<{
  entity: string;
  validatedForm: SuperValidated<T>;
  image?: GetImageAPI | null;
}>;

// Helper functions for data processing
async function fetchParentResource(
  parentType: HierarchicalResource,
  parentRef: string,
  fetch: typeof window.fetch
): Promise<Resource> {
  const response = await fetch(
    `${API_PATH}/${HierarchicalResourcePath[parentType]}/${parentRef}`
  );

  if (!response.ok) {
    throw error(response.status);
  }

  return response.json();
}

async function fetchImage(
  entityId: string,
  fetch: typeof window.fetch
): Promise<GetImageAPI | null> {
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
  session,
  fetch
}: {
  resourceType: HierarchicalResource;
  parentId?: string;
  parentRef?: string;
  parentResourceType?: HierarchicalResource;
  keyToParent?: string;
  insertSchema: z.ZodSchema;
  session?: Session;
  fetch: typeof window.fetch;
}): Promise<SuperValidated<T>> {
  // Handle new resource without parent
  if (!parentResourceType || !parentId) {
    const form = (await superValidate(zod(insertSchema))) as SuperValidated<T>;

    // Handle new organisation case
    if (resourceType === 'organisation' && session?.user) {
      // @ts-ignore
      form.data.userRoles = [
        {
          userId: session.user.id,
          role: 'owner',
          user: session.user
        }
      ];
    }

    return form;
  }

  // Handle new resource with parent
  if (!parentRef || !keyToParent) {
    throw error(
      400,
      `The jungle teems with the spirits of the dead... Perhaps ${parentResourceType}.${keyToParent} has joined them?`
    );
  }

  const form = (await superValidate(zod(insertSchema))) as SuperValidated<T>;
  let initialData: Record<string, any> = {
    ...form.data,
    resourceType,
    maintainerRoles: []
  };

  const parentData = await fetchParentResource(parentResourceType, parentRef, fetch);
  initialData[keyToParent] = parentData.id;

  // Process parent data based on resource type
  if (isOrganisation(parentData)) {
    initialData = mergeOrganisationRoles(initialData as Project, parentData.userRoles);
  } else if (isLayer(initialData as Resource) && isProject(parentData)) {
    initialData = mergeProjectProperties(initialData as Layer, parentData.properties);
  } else if (isFeature(initialData as Resource) && isLayer(parentData)) {
    initialData = mergeFeatureProperties(initialData as Feature, parentData);
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
  resourceType: HierarchicalResource;
  entityRef: string;
  updateSchema: z.ZodSchema;
  fetch: typeof window.fetch;
}): Promise<{
  form: SuperValidated<T>;
  image: GetImageAPI | null;
}> {
  const response = await fetch(
    `${API_PATH}/${HierarchicalResourcePath[resourceType]}/${entityRef}`
  );

  if (!response.ok) {
    throw error(response.status);
  }

  const formData: T = await response.json();
  const form = (await superValidate(formData, zod(updateSchema))) as SuperValidated<T>;

  // Fetch image for organisation or project
  const image = await getImageIfNeeded(formData, fetch);

  return { form, image };
}

let getImageIfNeeded = async (formData: any, fetch: typeof window.fetch) => {
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
  session,
  ...options
}: LoadFormDataOptions<T>): LoadFormDataResponse<T> {
  const entityRef = entity || NEW_REF;
  const resourceType = refToResourceType(resourcePath) as HierarchicalResource;

  if (entityRef === NEW_REF) {
    const form = await prepareNewForm<T>({
      resourceType,
      parentId: options.parentId,
      parentRef: options.parentRef,
      parentResourceType: resourceConfig[resourceType].parentResourceType,
      keyToParent: resourceConfig[resourceType].keyToParent,
      insertSchema,
      session,
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

function resourceIsOrganisation(resource: Resource): resource is Organisation {
  return 'userRoles' in resource && !('organisationId' in resource);
}

function resourceIsProject(resource: Resource): resource is Project {
  return 'organisationId' in resource;
}

function resourceIsLayer(resource: Resource): resource is Layer {
  return 'projectId' in resource;
}

function resourceIsFeature(resource: Resource): resource is Feature {
  return 'layerId' in resource;
}

function mergeOrganisationRoles(
  project: Project,
  userRoles: OrganisationRole[]
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
  const existingPropertyIds: Id[] = [];

  // Add project properties that aren't already in the layer
  properties.forEach((projectProp: Property) => {
    if (!existingPropertyIds.includes(projectProp.id)) {
      if (typeof projectProp.translations !== 'object') {
        projectProp.translations = toNestedTranslations<PropertyI18n>(
          projectProp.translations
        );
      }
      layer.properties.push({
        layerId: layer.id,
        propertyId: projectProp.id,
        isVisible: false,
        property: projectProp
      });
    }
  });
  return layer;
}

export const PRISM_PARAMETERS = ['organisation', 'project', 'layer'];
export const MODE_PARAMETER = 'isAdminView';

export const getQueryParamsWithoutPrismOrModeParams = (url: URL) => {
  // Get all query parameters except the known prism parameters
  const params = Array.from(url.searchParams.entries()).filter(
    ([key]) => !PRISM_PARAMETERS.includes(key) && key !== MODE_PARAMETER
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

export const isValidQueryParamsOrError = (table: any, url: URL) => {
  const queryParams = getQueryParamsWithoutPrismOrModeParams(url);
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
