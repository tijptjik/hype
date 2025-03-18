import { error, json } from '@sveltejs/kit';
import { actionResult } from 'sveltekit-superforms';
import client, { toNestedTranslations, validateTableColumns } from '$lib/db';
import { getUserRoles } from '$lib/auth/utils';
import { superValidate } from 'sveltekit-superforms';
// LIB
import { ADMIN_PATH, API_PATH } from '$lib/index';
// ACCESS CONTROL
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
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
// Types
import type { SuperValidated } from 'sveltekit-superforms';
import type {
  ApiEntity,
  Feature,
  Id,
  Layer,
  OrganisationRole,
  Project,
  Property,
  PropertyI18n,
  Resource,
  ResourceType,
  Task
} from '$lib/types';
import type { UserRole } from '$lib/auth/utils';
import { NEW_REF } from '$lib';
import type { AccessStrategyOption, StatefulAccessOption } from '$lib/types';
import type { GetImageAPI } from '$lib/types';
import type { Session } from '@auth/core/types';

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
    // TODO : Make the redirect more robust by passing in the entityRef
    if (userLosesAccess) {
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/`, {
        status: 302
      });
    } else {
      const entityRef = validatedForm.data.code || validatedForm.data.id;
      return actionResult('redirect', `${ADMIN_PATH}/${resourcePath}/${entityRef}`, {
        status: 303
      });
    }
  }
  return actionResult<SuperValidated<T>, 'success'>('success', validatedForm, {
    status: code
  });
};

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

type LoadFormDataResponse<T> = Promise<{
  entity: string;
  validatedForm: SuperValidated<T>;
  image?: GetImageAPI | null;
}>;

// Get parent reference from resource
const getParentRef = (entity: Project | Layer | Feature | Task): string | null => {
  if ('featureId' in entity) return entity.featureId;
  if ('layerId' in entity) return entity.layerId;
  if ('projectId' in entity) return entity.projectId;
  if ('organisationId' in entity) return entity.organisationId;
  return null;
};

export async function loadFormData<T>({
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
  let form;
  let image: GetImageAPI | null = null;

  if (entityRef === NEW_REF) {
    const { parentResourceType, parentRefKey, keyToParent } =
      resourceConfig[resourceType];
    const { parentId, parentRef } = options;

    if (parentResourceType && parentId) {
      if (!parentRef) {
        throw error(
          400,
          `The jungle teems with the spirits of the dead... Perhaps ${parentResourceType}.${parentRefKey} has joined them?`
        );
      }

      // First create the form with the schema
      form = (await superValidate(zod(insertSchema))) as SuperValidated<T>;

      // Initialize the base data
      let initialData: Record<string, any> = {
        ...form.data, // Include existing form defaults
        resourceType: resourceType,
        maintainerRoles: []
      };

      // Fetch and process parent data
      const parentResponse = await fetch(
        `${API_PATH}/${HierarchicalResourcePath[parentResourceType]}/${parentRef}`
      );
      if (parentResponse.ok) {
        const parentData: ApiEntity = await parentResponse.json();

        // Add parent ID
        initialData[keyToParent as string] = parentData.id;

        // Merge organization roles if this is a project
        if (resourceType === 'project') {
          initialData = mergeOrganisationRoles(
            initialData as Project,
            parentData.userRoles
          );
        } else if (resourceType === 'layer') {
          initialData = mergeProjectProperties(
            initialData as Layer,
            parentData.properties
          );
        }

        // Update the form with the complete initial data
        form.data = initialData;
      }
    } else {
      form = await superValidate(zod(insertSchema));
      if (resourceType === 'organisation') {
        // Merge in current user as the organisation owner
        form.data.userRoles.push({
          userId: session?.user.id,
          role: 'owner',
          user: session?.user
        });
      }
    }
  } else {
    const endPoint = `${API_PATH}/${resourcePath}/${entityRef}`;
    const request = await fetch(endPoint);

    if (request.status >= 400) {
      throw error(request.status);
    }

    const formData: T = await request.json();
    form = (await superValidate(formData, zod(updateSchema))) as SuperValidated<T>;

    // Fetch associated image if this is an organisation or project
    if (resourceType == 'organisation' || resourceType == 'project') {
      if (formData.imageId) {
        const imageResponse = await fetch(`${API_PATH}/images/${formData.imageId}`);
        if (imageResponse.ok) {
          image = await imageResponse.json();
        } else {
          console.error('Error fetching image:', imageResponse.statusText);
        }
      }
    }
  }
  return {
    entity: entityRef,
    validatedForm: form,
    image
  };
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

export const getQueryParamsWithoutPrism = (url: URL) => {
  // Get all query parameters except the known prism parameters
  const params = Array.from(url.searchParams.entries()).filter(
    ([key]) => !PRISM_PARAMETERS.includes(key)
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
  const queryParams = getQueryParamsWithoutPrism(url);
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
