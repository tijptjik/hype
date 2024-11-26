// TYPES
import type {
  FilterableResourceToEntityId,
  EntityWithData,
  ResourceToEntity,
  ResourceToText,
  Project,
  Layer,
  Feature,
  Organisation,
  Task,
  ResourceToRecord
} from '$lib/types';

// Meta
let meta = $state({ title: 'Admin' });


let context = $state({ parentRef: null });


// Resources
export const resources: ResourceToEntity = $state({
  organisation: [],
  project: [],
  layer: [],
  feature: [],
  task: []
});
export const filterTexts: ResourceToText = $state({
  organisation: '',
  project: '',
  layer: '',
  feature: '',
  task: ''
});
export const queryPrimsParams: FilterableResourceToEntityId = $state({
  organisation: [],
  project: [],
  layer: []
});
export const queryFilterParams: ResourceToRecord = $state({
  organisation: {
    isPublished: null
  },
  project: {
    isPublished: null
  },
  layer: {
    isPublished: null
  },
  feature: {
    isPendingReview: false,
    isPublished: null
  },
  task: {
    isReviewed: false
  }
});

export const filteredResources: ResourceToEntity = $state({
  organisation: [],
  project: [],
  layer: [],
  feature: [],
  task: []
});

export const appMeta = { meta, context };
