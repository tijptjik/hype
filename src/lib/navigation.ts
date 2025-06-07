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
  Inbox as TaskIcon
} from '@steeze-ui/heroicons';
// ENUMS
import { HierarchicalResource, ResourcePath } from '$lib/enums';
// TYPES
import type { ResourceState } from '$lib/context/resource.svelte';
import type { Code, FacetType, Id } from '$lib/types';

// NAVIGATION
// NOTE : We cannot use Enums here for path or seq as the build process only procudes them on a hard refresh.
export const navItems = {
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
  }
};

export const navigateOnAdmin = (
  resourceState: ResourceState,
  resource: HierarchicalResource | false,
  entityRef?: Id | Code,
  facet?: FacetType,
  queryParams?: Record<string, string>
) => {
  let url = `${ADMIN_PATH}`;
  if (resource) {
    url += `/${ResourcePath[resource]}`;
    resourceState.setResource(resource);
  } else {
    resourceState.setResource(false);
  }
  if (entityRef) {
    url += `/${entityRef}`;
    resourceState.setEntity(entityRef);
  } else {
    resourceState.setEntity(false);
  }
  if (facet) {
    url += `#${facet}`;
    resourceState.setFacet(facet);
  } else {
    resourceState.setFacet(false);
  }
  if (queryParams) url += `?${new URLSearchParams(queryParams).toString()}`;
  goto(url);
};

// UTILS
export const reversePath = new Map<string, HierarchicalResource>();

if (ResourcePath) {
  Object.keys(ResourcePath).forEach((path: string) => {
    const pathValue: string =
      ResourcePath[path as keyof typeof ResourcePath];
    reversePath.set(pathValue, path as HierarchicalResource);
  });
}
