import {
    Users as OrganisationIcon,
    Squares2x2 as ProjectIcon,
    Square3Stack3d as LayerIcon,
    MapPin as FeatureIcon,
  } from '@steeze-ui/heroicons';
import type { ResourceTypes } from '$lib/types';
import type { IconSource } from '@steeze-ui/heroicons';

export const navItems: { [key in ResourceTypes]: { name: string; icon: IconSource; seq: number; path: string } }  = {
    organisation: { name: 'Organisations', icon: OrganisationIcon, seq: 1, path: 'organisations' },
    project: { name: 'Projects', icon: ProjectIcon, seq: 2, path: 'projects' },
    layer: { name: 'Layers', icon: LayerIcon, seq: 3, path: 'layers' },
    feature: { name: 'Features', icon: FeatureIcon, seq: 4, path: 'features' }
  };