// SVELTE
import { goto } from '$app/navigation';
// I18N
import { m } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
// ICONS
import {
  Users as OrganisationIcon,
  Squares2x2 as ProjectIcon,
  Square3Stack3d as LayerIcon,
  MapPin as FeatureIcon,
  Inbox as TaskIcon,
  BuildingLibrary as HubIcon
} from '@steeze-ui/heroicons';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';
// TYPES
import type { AdminCtx } from '$lib/context/admin.svelte';
import type { Code, FacetType, Id, NavItem } from '$lib/types';

// NAVIGATION
// NOTE : We cannot use Enums here for path or seq as the build process only procudes them on a hard refresh.
export const navItems: Record<Exclude<FirstClassResource, 'property'>, NavItem> = {
  organisation: {
    name: m.maps__organisations(),
    icon: OrganisationIcon,
    seq: 1,
    path: 'organisations',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  project: {
    name: m.maps__projects(),
    icon: ProjectIcon,
    seq: 2,
    path: 'projects',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  layer: {
    name: m.maps__layers(),
    icon: LayerIcon,
    seq: 3,
    path: 'layers',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  feature: {
    name: m.omni__title_features(),
    icon: FeatureIcon,
    seq: 4,
    path: 'features',
    isShownInSidebar: true,
    isAlwaysExpanded: true
  },
  task: {
    name: m.navbar__tasks(),
    icon: TaskIcon,
    seq: 5,
    path: 'tasks',
    isShownInSidebar: false,
    isAlwaysExpanded: false
  },
  hub: {
    name: 'Hubs',
    icon: HubIcon,
    seq: 6,
    path: 'hubs',
    isShownInSidebar: false,
    isAlwaysExpanded: false
  }
};

export const navigateOnAdmin = (
  adminCtx: AdminCtx,
  resource: FirstClassResource | false,
  entityRef?: Id | Code,
  facet?: FacetType,
  queryParams?: Record<string, string>
) => {
  let url = `${ADMIN_PATH}`;
  if (resource) {
    url += `/${ResourcePath[resource]}`;
    adminCtx.setResourceType(resource);
  } else {
    adminCtx.setResourceType(false);
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

// UTILS
export const reversePath = new Map<string, FirstClassResource>();

if (ResourcePath) {
  Object.keys(ResourcePath).forEach((path: string) => {
    const pathValue: string = ResourcePath[path as keyof typeof ResourcePath];
    reversePath.set(pathValue, path as FirstClassResource);
  });
}

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

    return breadcrumbs;
  } catch (error) {
    console.error('Failed to generate breadcrumbs:', error);
    return [];
  }
}
