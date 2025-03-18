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
// ENUMS
import { HierarchicalResource, HierarchicalResourcePath } from '$lib/types';
// TYPES
import type { Code, FacetType, Id } from '$lib/types';

// NAVIGATION
// NOTE : We cannot use Enums here for path or seq as the build process only procudes them on a hard refresh.
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

export const navigate = (url: string) => {
  const langUrl = i18n.resolveRoute(url);
  goto(langUrl);
};

export const navigateOnAdmin = (
  resource: HierarchicalResource | false,
  entityRef?: Id | Code,
  facet?: FacetType,
  queryParams?: Record<string, string>
) => {
  let url = `${ADMIN_PATH}`;
  if (resource) url += `/${HierarchicalResourcePath[resource]}`;
  if (entityRef) url += `/${entityRef}`;
  if (facet) url += `#${facet}`;
  if (queryParams) url += `?${new URLSearchParams(queryParams).toString()}`;
  navigate(url);
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
