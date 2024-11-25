// TYPES
import type {
  FilterableResourceToEntityId,
  EntityWithData,
  ResourceToEntity,
  ResourceToText,
  Project,
  Layer,
  Feature,
  Organisation
} from '$lib/types';

// Meta
let meta = $state({ title: 'Admin' });


let context = $state({ parentRef: null });


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
export const filteredResources: ResourceToEntity = $state({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});

export const appMeta = { meta, context };
