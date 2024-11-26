import {
  Users as OrganisationIcon,
  Squares2x2 as ProjectIcon,
  Square3Stack3d as LayerIcon,
  MapPin as FeatureIcon,
  Inbox as TaskIcon
} from '@steeze-ui/heroicons';
import type { ResourceToNavItem } from '$lib/types';

export const navItems: ResourceToNavItem = {
  organisation: { name: 'Organisations', icon: OrganisationIcon, seq: 1, path: 'organisations', isShownInSidebar: true, isAlwaysExpanded: false },
  project: { name: 'Projects', icon: ProjectIcon, seq: 2, path: 'projects', isShownInSidebar: true, isAlwaysExpanded: false},
  layer: { name: 'Layers', icon: LayerIcon, seq: 3, path: 'layers', isShownInSidebar: true, isAlwaysExpanded: false},
  feature: { name: 'Features', icon: FeatureIcon, seq: 4, path: 'features', isShownInSidebar: true, isAlwaysExpanded: true },
  task: { name: 'Review Queue', icon: TaskIcon, seq: 5, path: 'tasks', isShownInSidebar: false, isAlwaysExpanded: false }
};
