// SVELTE
import { goto } from '$app/navigation';
// I18N
import { i18n } from '$lib/i18n';
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
// import { setActiveResource, setActiveEntity } from '$lib/stores/resources.svelte';
// ENUMS
import { HierarchicalResource, HierarchicalResourcePath } from '$lib/types';
// TYPES
import type { Code, FacetType, Id } from '$lib/types';
import type { Page } from '@sveltejs/kit';

// NAVIGATION
export const navItems = {
  organisation: {
    name: 'Organisations',
    icon: OrganisationIcon,
    seq: 1,
    path: 'organisations',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  project: {
    name: 'Projects',
    icon: ProjectIcon,
    seq: 2,
    path: 'projects',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  layer: {
    name: 'Layers',
    icon: LayerIcon,
    seq: 3,
    path: 'layers',
    isShownInSidebar: true,
    isAlwaysExpanded: false
  },
  feature: {
    name: 'Features',
    icon: FeatureIcon,
    seq: 4,
    path: 'features',
    isShownInSidebar: true,
    isAlwaysExpanded: true
  },
  task: {
    name: 'Review Queue',
    icon: TaskIcon,
    seq: 5,
    path: 'tasks',
    isShownInSidebar: false,
    isAlwaysExpanded: false
  }
};

/**
 * Navigate to a resource page
 *
 * @param resourceType The type of resource to navigate to
 */
export function goToResource(resource: HierarchicalResource) {
  // resourceState.setResource(resource);
  goto(`${ADMIN_PATH}/${HierarchicalResourcePath[resource]}`);
}

/**
 * Navigate to an entity page
 *
 * @param resourceType The type of resource
 * @param entityRef The reference of the entity
 */
export function goToEntity(resource: HierarchicalResource, entityRef: Id | Code) {
  // resourceState.setEntity(entityRef, resource);
  goto(`${ADMIN_PATH}/${HierarchicalResourcePath[resource]}/${entityRef}`);
}

/**
 * Navigate to a facet of an entity
 *
 * @param resourceType The type of resource
 * @param entityRef The reference of the entity
 * @param facet The facet to navigate to
 */
export function goToEntityFacet(
  resource: HierarchicalResource,
  entityRef: Id | Code,
  facet: FacetType
) {
  // resourceState.setEntity(entityRef, resource);
  // resourceState.setFacet(facet);
  goto(`${ADMIN_PATH}/${HierarchicalResourcePath[resource]}/${entityRef}#${facet}`);
}

// // STATE : CONTEXT
// export const goToResource = (
//   e: Event,
//   routerState: RouterState,
//   resourceType: ResourceType
// ) => {
//   e.preventDefault();
//   const url = new URL(window.location.href);
//   url.pathname = `${ADMIN_PATH}/${navItems[resourceType].path}`;
//   // UPDATE ROUTER STATE
//   routerState.updateWith({
//     resource: resourceType,
//     entity: false,
//     facet: false
//   });
//   // NAVIGATE
//   navigate(url.toString());
// };

// export const goToEntity = (
//   e: Event,
//   routerState: RouterState,
//   resourceType: ResourceType,
//   entityPath: Ref
// ) => {
//   e.preventDefault();
//   let facet = 'core';
//   const url = new URL(window.location.href);
//   url.pathname = `${ADMIN_PATH}/${navItems[resourceType].path}/${entityPath}`;
//   if (resourceType === routerState.resource && routerState.facet) {
//     facet = routerState.facet;
//   }
//   // url.hash = `#${facet}`;
//   // UPDATE ROUTER STATE
//   routerState.updateWith({
//     resource: resourceType,
//     entity: entityPath,
//     facet: facet as FacetType
//   });
//   // NAVIGATE
//   navigate(url.toString());
// };

// export const goToFacet = (e: Event, routerState: RouterState, facet: FacetType) => {
//   e.preventDefault();
//   const url = new URL(window.location.href);
//   routerState.updateWith({ facet: facet });
//   navigate(url.toString());
// };

export const navigate = (url: string) => {
  const langUrl = i18n.resolveRoute(url);
  // TODO Remove this hack once we have a proper way to navigate to the language url
  // goto(langUrl).then(() => goto(langUrl));
  goto(langUrl);
};

// UTILS
export const reversePath = new Map<string, HierarchicalResource>();

if (HierarchicalResourcePath) {
  Object.keys(HierarchicalResourcePath).forEach((path: string) => {
    const pathValue: string =
      HierarchicalResourcePath[path as keyof typeof HierarchicalResourcePath];
    reversePath.set(pathValue, path as HierarchicalResource);
  });
}
