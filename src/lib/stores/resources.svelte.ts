import type {
  FilterableResourceToEntityId,
  EntityWithData,
  ResourceToEntity,
  ResourceToText
} from '$lib/types';
import { OrganisationSchema, ProjectSchema, LayerSchema, type Feature } from '$lib/db/schema';

// Meta
export const meta = $state({ title: 'Admin' });

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
export const filteredResources : ResourceToEntity = $state<{
  organisation: EntityWithData<typeof OrganisationSchema>[];
  project: EntityWithData<typeof ProjectSchema>[];
  layer: EntityWithData<typeof LayerSchema>[];
  feature: EntityWithData<Feature>[];
}>({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});
