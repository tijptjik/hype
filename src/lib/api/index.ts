import { error, json } from '@sveltejs/kit';
import { actionResult } from 'sveltekit-superforms';
import client, { toNestedTranslations, validateTableColumns } from '$lib/db';
import { getUserRoles } from '$lib/auth/utils';
import { superValidate } from 'sveltekit-superforms';
// ACCESS CONTROL
import {
  publicAccessOptions,
  hierarchicalOwnOptions,
  hierarchicalChildrenOptions,
  hierarchicalGrandChildrenOptions,
  relationalAccessOptions
} from '$lib/types';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
// Types
import type { SuperValidated } from 'sveltekit-superforms';
import type {
  ApiEntity,
  Id,
  Layer,
  OrganisationRole,
  Project,
  Property,
  PropertyI18n,
  Resource,
  ResourceType
} from '$lib/types';
import type { UserRole } from '$lib/auth/utils';
import type { ZodSchema } from 'zod';
import { appMeta } from '$lib/stores/resources.svelte';
import { NEW_REF } from '$lib';
import type { AccessStrategyOption, StatefulAccessOption } from '$lib/types';

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
      return actionResult('redirect', `/admin/${resourcePath}/`, {
        status: 302
      });
    } else {
      const entityRef = validatedForm.data.code || validatedForm.data.id;
      return actionResult('redirect', `/admin/${resourcePath}/${entityRef}`, {
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
    image: 'project'
  };

  // Check each strategy until we find one that grants access
  if (publicAccessOptions.includes(strategy)) {
    hasAccess = true;
  } else if (hierarchicalOwnOptions.includes(strategy)) {
    if (userRoles.some((role) => role.type === resourceType)) {
      hasAccess = true;
    }
  } else if (
    hierarchicalChildrenOptions.includes(strategy) ||
    relationalAccessOptions.includes(strategy)
  ) {
    if (
      userRoles.some(
        (role) =>
          role.type ===
          resourceOwnership[resourceType as keyof typeof resourceOwnership]
      )
    ) {
      hasAccess = true;
    }
  } else if (hierarchicalGrandChildrenOptions.includes(strategy)) {
    if (
      userRoles.some(
        (role) =>
          role.type ===
          resourceOwnership[
            resourceOwnership[
              resourceType as keyof typeof resourceOwnership
            ] as keyof typeof resourceOwnership
          ]
      )
    ) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    return error(401, `All out of ${resourceType}`);
  }

  return hasAccess;
};

export const getDatabaseOrError = async (
  locals: App.Locals,
  platform: App.Platform | undefined,
  accessStrategy: AccessStrategyOption,
  resourceType?: string,
  refId?: string,
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
  privilegedStrategy: StatefulAccessOption | null = null
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
  checkAccessOrError(userRoles, accessStrategy, resourceType);

  // PROJECT ACCESS CHECK
  if (
    accessStrategy == 'EntityFromEditableProject' ||
    accessStrategy == 'ResourceFromEditableProject'
  ) {
    if (!refId || !checkProjectAccess) {
      error(400, 'Project ID or checkProjectAccess function is required');
    }
    const projectAccess = await checkProjectAccess(db, session.user.id, refId);

    // Upgrade access strategy if project access is found and stateful strategy is provided
    if (projectAccess?.role && privilegedStrategy !== null) {
      accessStrategy = privilegedStrategy;
    } else {
      error(404, 'ProjectAccess goes brrrr');
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

const refToResourceType = (ref: string) => {
  return {
    organisations: 'organisation',
    projects: 'project',
    layers: 'layer',
    features: 'feature'
  }[ref];
};
// Resource configuration mapping
const resourceConfig: Record<
  ResourceType,
  { parentResourceType?: string; parentRefKey?: string; keyToParent?: string }
> = {
  organisation: {},
  project: {
    parentResourceType: 'organisation',
    parentRefKey: 'code',
    keyToParent: 'organisationId'
  },
  layer: {
    parentResourceType: 'project',
    parentRefKey: 'code',
    keyToParent: 'projectId'
  },
  feature: {
    parentResourceType: 'layer',
    parentRefKey: 'id',
    keyToParent: 'layerId'
  }
};

export async function loadFormData<T extends Record<string, any>>({
  entity,
  resourcePath,
  insertSchema,
  updateSchema,
  fetch
}: {
  entity: string | undefined;
  resourcePath: string;
  insertSchema: ZodSchema;
  updateSchema: ZodSchema;
  fetch: typeof globalThis.fetch;
}): Promise<{
  entity: string;
  validatedForm: SuperValidated<T>;
}> {
  const entityRef = entity || NEW_REF;
  let form;

  if (entityRef === NEW_REF) {
    const resourceType = refToResourceType(resourcePath) as ResourceType;
    const { parentResourceType, parentRefKey, keyToParent } =
      resourceConfig[resourceType];

    if (parentResourceType && parentRefKey) {
      const parentRef = appMeta.context.parentRef;

      if (!parentRef) {
        throw error(
          400,
          `The jungle teems with the spirits of the dead. Perhaps ${parentResourceType}.${parentRefKey} has joined them?`
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
      const parentResponse = await fetch(`/api/${parentResourceType}s/${parentRef}`);
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
    }
  } else {
    const endPoint = `/api/${resourcePath}/${entityRef}`;
    const request = await fetch(endPoint);

    if (request.status >= 400) {
      throw error(request.status);
    }

    const formData: T = await request.json();
    // form = await superValidate<T>(formData, zod(updateSchema));
    form = (await superValidate(formData, zod(updateSchema))) as SuperValidated<T>;
  }

  appMeta.context.parentRef = null;

  return {
    entity: entityRef,
    validatedForm: form
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
          image: userRole.user.image
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
  return Object.fromEntries(
    Array.from(url.searchParams.entries()).filter(
      ([key]) => !PRISM_PARAMETERS.includes(key)
    )
  );
};

export const isValidQueryParamsOrError = (table: any, url: URL) => {
  const queryParams = getQueryParamsWithoutPrism(url);
  const queryParamsKeys = Object.keys(queryParams);
  if (queryParamsKeys.length > 0) {
    const { valid, invalidColumns } = validateTableColumns(
      table,
      Object.keys(queryParams)
    );
    if (!valid) {
      return error(400, `Invalid filter fields: ${invalidColumns.join(', ')}`);
    }
  }

  return queryParams;
};
