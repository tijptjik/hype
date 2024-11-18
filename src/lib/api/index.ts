import { error, json } from '@sveltejs/kit';
import { actionResult } from 'sveltekit-superforms';
import client, { toNestedTranslations } from '$lib/db';
import { getUserRoles } from '$lib/auth/utils';
import { superValidate } from 'sveltekit-superforms';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationUpdateAPI } from '../db/zod';
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

export type AccessStrategyOption =
  | 'Public'
  | 'SuperAdmin'
  | 'ResourceAll'
  | 'ResourceOwn'
  | 'ResourceOwnChildren'
  | 'ResourceOwnGrandChildren'
  | 'EntityAny'
  | 'EntityOwn'
  | 'EntityOwnChild'
  | 'EntityOwnGrandChild';

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
    return actionResult<SuperValidated<T>, 'failure'>('failure', validatedForm, { status: 400 });
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
  return actionResult<SuperValidated<T>, 'success'>('success', validatedForm, { status: code });
};

const checkAccessOrError = (
  userRoles: UserRole[],
  accessStrategy: AccessStrategyOption,
  resourceType: string = 'EVERYTHING'
) => {
  let hasAccess = false;

  const resourceParents = {
    layer: 'project',
    project: 'organisation',
    feature: 'layer'
  };

  if (['Public', 'SuperAdmin', 'ResourceAll', 'EntityAny'].includes(accessStrategy)) {
    hasAccess = true;
  } else if (['ResourceOwn', 'EntityOwn'].includes(accessStrategy)) {
    hasAccess = userRoles.some((role) => role.type === resourceType);
  } else if (['ResourceOwnChildren', 'EntityOwnChild'].includes(accessStrategy)) {
    hasAccess = userRoles.some(
      (role) => role.type === resourceParents[resourceType as keyof typeof resourceParents]
    );
  } else if (['ResourceOwnGrandChildren', 'EntityOwnGrandChild'].includes(accessStrategy)) {
    hasAccess = userRoles.some(
      (role) =>
        role.type ===
        resourceParents[
          resourceParents[
            resourceType as keyof typeof resourceParents
          ] as keyof typeof resourceParents
        ]
    );
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
  resourceType?: string
) => {
  // Checks whether the user is logged in
  const session = await getSessionOrError(locals);
  // Connects to the database
  const db = client(platform?.env.DB);

  // Gets the user's roles
  const userRoles = await getUserRoles(db, session.user.id);

  // TODO Add SuperAdmin to User Table
  if (session.user.superAdmin === true) {
    // if (session.user.email === 'm@type.hk') {
    accessStrategy = 'SuperAdmin';
  }

  // Checks whether the user has access to the resource
  checkAccessOrError(userRoles, accessStrategy, resourceType);

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
  const entityRef = entity || 'new';
  let form;

  if (entityRef === 'new') {
    const resourceType = refToResourceType(resourcePath) as ResourceType;
    const { parentResourceType, parentRefKey, keyToParent } = resourceConfig[resourceType];

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
        const parentData : ApiEntity = await parentResponse.json();
        
        // Add parent ID
        initialData[keyToParent as string] = parentData.id;

        // Merge organization roles if this is a project
        if (resourceType === 'project') {
          initialData = mergeOrganisationRoles(initialData as Project, parentData.userRoles);
        } else if (resourceType === 'layer') {
          initialData = mergeProjectProperties(initialData as Layer, parentData.properties);
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

function mergeOrganisationRoles(project: Project, userRoles: OrganisationRole[]): Project {
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
        projectProp.translations = toNestedTranslations<PropertyI18n>(projectProp.translations);
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
