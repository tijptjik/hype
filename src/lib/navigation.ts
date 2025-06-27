// SVELTE
import { goto } from '$app/navigation';
// LIB
import { ADMIN_PATH } from '$lib/index';
// ENUMS
import { FirstClassResource, ResourcePath, ResourceRefKey } from '$lib/enums';
// TYPES
import type { AdminCtx } from '$lib/context/admin.svelte';
import type {
  Code,
  FacetType,
  Id,
  Resource,
  Organisation,
  Project,
  Hub,
  NavigableResource
} from '$lib/types';

function isNavigable(resource: any): resource is NavigableResource {
  return (
    Object.values(FirstClassResource).includes(resource) &&
    resource !== FirstClassResource.property
  );
}

// NAVIGATION
export const getUrlForResourceIndex = (resource: FirstClassResource) => {
  return `${ADMIN_PATH}/${getResourcePathPart(resource)}`;
};

export const getUrlForResource = (
  adminCtx: AdminCtx,
  resource: FirstClassResource,
  id: Id,
  facet?: string
) => {
  const ref = getResourceRef(adminCtx, resource, id);
  if (!ref) return null;
  return `${ADMIN_PATH}/${getResourcePathPart(resource)}/${ref}${facet ? `#${facet}` : ''}`;
};

export const getResourceRef = (
  adminCtx: AdminCtx,
  resource: FirstClassResource,
  id: Id
) => {
  if (!resource) return false;
  const refKey = ResourceRefKey[resource as keyof typeof ResourceRefKey];
  const entity = adminCtx.appCtx.cache[resource].get(id);
  if (!entity) return false;
  return entity[refKey as keyof Resource];
};

export const getResourcePathPart = (resource?: FirstClassResource) => {
  if (!resource) return null;
  return ResourcePath[resource];
};

export const navigateOnAdmin = (
  adminCtx: AdminCtx,
  resource: FirstClassResource | false,
  entityRef?: Id | Code,
  facet?: FacetType,
  queryParams?: Record<string, string>
) => {
  let url = `${ADMIN_PATH}`;
  if (resource && isNavigable(resource)) {
    url += `/${ResourcePath[resource]}`;
    adminCtx.setResourceType(resource);
  } else {
    adminCtx.setResourceType(false);
    if (resource) {
      console.warn(`Attempted to navigate to a non-navigable resource: ${resource}`);
      return;
    }
  }

  if (entityRef) {
    url += `/${entityRef}`;
    adminCtx.setResourceRef(entityRef);
  } else {
    adminCtx.setResourceRef(false);
  }

  if (queryParams) url += `?${new URLSearchParams(queryParams).toString()}`;
  if (facet) {
    url += `#${facet}`;
    adminCtx.setFacet(facet);
  } else {
    adminCtx.setFacet(false);
  }
  goto(url);
};

export async function navigateOnAdminById(
  adminCtx: AdminCtx,
  resourceType: FirstClassResource | false,
  id: Id,
  ...args: any[]
) {
  let ref = id;
  if (
    resourceType == 'organisation' ||
    resourceType == 'project' ||
    resourceType == 'hub'
  ) {
    const resource = await adminCtx.appCtx.getResourceById(resourceType, id);
    if (resource) {
      ref = (resource as Organisation | Project | Hub).code;
    }
  }
  navigateOnAdmin(adminCtx, resourceType as FirstClassResource, ref, ...args);
}

// UTILS
export const reversePath = new Map<string, FirstClassResource>();

if (ResourcePath) {
  Object.keys(ResourcePath).forEach((path: string) => {
    const pathValue: string = ResourcePath[path as keyof typeof ResourcePath];
    reversePath.set(pathValue, path as FirstClassResource);
  });
}

// TODO add proper support for navigation state on appCtx so that
// we can use it in components which are used in both admin and (app)
export const getActiveResourceAndRefFromUrl = (): {
  resourceType: FirstClassResource | false;
  resourceRef: Id | Code | false;
  facet: string | false;
} => {
  const urlObj = new URL(window.location.href);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  const resourceType = reversePath.get(pathParts[0]) || false;
  const resourceRef = pathParts[1] || false;

  return {
    resourceType,
    resourceRef,
    facet: urlObj.hash.slice(1) || false
  };
};

// ═══════════════════════
// BREADCRUMBS :: ASYNC UTILITIES
// ═══════════════════════

/**
 * Generate breadcrumbs for a resource hierarchy using async lookups
 */
export async function getBreadcrumbs(
  appCtx: any, // AppCtx type
  resourceType: FirstClassResource,
  resourceRef: Id | Code
): Promise<{ name: string; href: string }[]> {
  try {
    // Get the current resource using the unified lookup
    const currentResource = await appCtx.getResourceByRef(resourceType, resourceRef);
    if (!currentResource) {
      return [];
    }

    // Get the full hierarchy for this resource
    const hierarchy = await appCtx.getHierarchy(currentResource);
    const breadcrumbs: { name: string; href: string }[] = [];

    // Build breadcrumbs from hierarchy (organization -> project -> layer -> feature)
    if (hierarchy.organisation && resourceType !== 'organisation') {
      breadcrumbs.push({
        name: appCtx.getContextualOrganisationName(hierarchy.organisation, false),
        href: `${ADMIN_PATH}/${ResourcePath.organisation}/${hierarchy.organisation.code}`
      });
    }

    if (hierarchy.project && resourceType !== 'project') {
      breadcrumbs.push({
        name: appCtx.getContextualProjectName(hierarchy.project, false),
        href: `${ADMIN_PATH}/${ResourcePath.project}/${hierarchy.project.code}`
      });
    }

    if (hierarchy.layer && resourceType !== 'layer') {
      breadcrumbs.push({
        name: appCtx.getContextualLayerName(hierarchy.layer, false),
        href: `${ADMIN_PATH}/${ResourcePath.layer}/${hierarchy.layer.id}`
      });
    }

    if (hierarchy.feature && resourceType !== 'feature') {
      breadcrumbs.push({
        name: appCtx.getContextualFeatureName(hierarchy.feature, false),
        href: `${ADMIN_PATH}/${ResourcePath.feature}/${hierarchy.feature.id}`
      });
    }

    return breadcrumbs;
  } catch (error) {
    console.error('Failed to generate breadcrumbs:', error);
    return [];
  }
}

// ═══════════════════════
// NAVIGATION :: TASKS
// ═══════════════════════

/**
 * Navigates to the next task. If the current task is the last task, it will navigate to the previous task. If no tasks are available, it will navigate to the overview.
 */

export const goToNextTask = (adminCtx: AdminCtx) => {
  let nextIndex;
  const currentIndex = adminCtx.filteredTasks.findIndex(
    (task) => task.id === adminCtx.activeResourceRef
  );
  const taskCount = adminCtx.filteredTasks.length;

  if (currentIndex !== -1) {
    if (currentIndex < taskCount - 1) {
      nextIndex = currentIndex + 1;
    } else if (currentIndex === taskCount - 1 && taskCount > 1) {
      nextIndex = currentIndex - 1;
    } else {
      nextIndex = undefined;
    }
  }
  const nextTaskId =
    nextIndex !== undefined ? adminCtx.filteredTasks[nextIndex].id : undefined;
  adminCtx.invalidateAndRefresh(FirstClassResource.task);
  navigateOnAdmin(adminCtx, FirstClassResource.task!, nextTaskId);
};
