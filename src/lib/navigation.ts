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
export const navItems: Record<FirstClassResource, NavItem> = {
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
  if (facet) {
    url += `#${facet}`;
    adminCtx.setFacet(facet);
  } else {
    adminCtx.setFacet(false);
  }
  if (queryParams) url += `?${new URLSearchParams(queryParams).toString()}`;
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
