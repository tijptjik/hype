import type { Resource, ResourceFilters, ResourceTypes, ResourceWithData } from '$lib/types';
import { OrganisationSchema, ProjectSchema, LayerSchema, FeatureSchema } from '$lib/db/schema';

// Resources

export const resources = $state<{ [key in ResourceTypes]: Resource[] }>({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});
export const filterTexts = $state<{ [key in ResourceTypes]: string }>({
  organisation: '',
  project: '',
  layer: '',
  feature: ''
});
export const queryFilters : ResourceFilters = $state({
  organisation: [],
  project: [],
  layer: []
});
export const filteredResources = $state<{
  organisation: ResourceWithData<typeof OrganisationSchema>[];
  project: ResourceWithData<typeof ProjectSchema>[];
  layer: ResourceWithData<typeof LayerSchema>[];
  feature: ResourceWithData<typeof FeatureSchema>[];
  }>({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});
export const meta = $state(
  {'title' : 'Admin'});