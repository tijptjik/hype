// TYPES
import type {
  FilterableResourceToEntityId,
  EntityWithData,
  ResourceToEntity,
  ResourceToText,
  NewOrganisation,
  Project,
  Layer,
  Feature
} from '$lib/types';

// Meta
let meta = $state({ title: 'Admin' });

// Resources
export const resources: ResourceToEntity = $state({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});
export const filterTexts: ResourceToText = $state({
  organisation: '',
  project: '',
  layer: '',
  feature: ''
});
export const queryFilters: FilterableResourceToEntityId = $state({
  organisation: [],
  project: [],
  layer: []
});
export const filteredResources: ResourceToEntity = $state<{
  organisation: EntityWithData<NewOrganisation>[];
  project: EntityWithData<Project>[];
  layer: EntityWithData<Layer>[];
  feature: EntityWithData<Feature>[];
}>({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});

export const appMeta = { meta };
