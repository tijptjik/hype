// // TYPES
// import type {
//   FilterableResourceToEntityId,
//   EntityWithData,
//   ResourceToEntity,
//   ResourceToText,
//   Project,
//   Layer,
//   Feature,
//   Organisation,
//   Task,
//   ResourceToRecord,
//   ResourceType,
//   FalsableResourceType,
//   FalsableRef
// } from '$lib/types';

// // Meta
// let meta = $state({ title: 'Admin' });

// // Active resource tracking
// let activeResource = $state<FalsableResourceType>(false);
// let activeEntity = $state<FalsableRef>(false);

// // Context
// let context = $state({ parentRef: null });

// // Resources
// export const resources: ResourceToEntity = $state({
//   organisation: [],
//   project: [],
//   layer: [],
//   feature: [],
//   task: []
// });

// export const filterTexts: ResourceToText = $state({
//   organisation: '',
//   project: '',
//   layer: '',
//   feature: '',
//   task: ''
// });

// export const queryPrimsParams: FilterableResourceToEntityId = $state({
//   organisation: [],
//   project: [],
//   layer: []
// });

// export const queryFilterParams: ResourceToRecord = $state({
//   organisation: {
//     isPublished: null
//   },
//   project: {
//     isPublished: null
//   },
//   layer: {
//     isPublished: null
//   },
//   feature: {
//     isPendingReview: false,
//     isPublished: null
//   },
//   task: {
//     isReviewed: false
//   }
// });

// export const filteredResources: ResourceToEntity = $state({
//   organisation: [],
//   project: [],
//   layer: [],
//   feature: [],
//   task: []
// });

// // Resource navigation mapping
// export const resourcePathMap: Record<ResourceType, string> = {
//   organisation: 'organisations',
//   project: 'projects',
//   layer: 'layers',
//   feature: 'features',
//   task: 'tasks'
// };

// export const pathToResourceMap: Record<string, ResourceType> = Object.fromEntries(
//   Object.entries(resourcePathMap).map(([key, value]) => [value, key as ResourceType])
// ) as Record<string, ResourceType>;

// // Expanded state for resources in sidebar
// // TODO Move to sidebar context
// export const expandedState: Record<ResourceType, boolean> = $state({
//   organisation: false,
//   project: false,
//   layer: false,
//   feature: true
// });

// // Functions to manage active resources
// export function setActiveResource(resource: FalsableResourceType) {
//   activeResource = resource;

//   // Update expanded state based on active resource
//   if (resource) {
//     Object.keys(expandedState).forEach((key) => {
//       expandedState[key as ResourceType] = key === resource;
//     });
//   }
// }

// export function setActiveEntity(entity: FalsableRef) {
//   activeEntity = entity;
// }

// export function getActiveResource(): FalsableResourceType {
//   return activeResource;
// }

// export function getActiveEntity(): FalsableRef {
//   return activeEntity;
// }

// // Function to toggle query parameters for filtering
// export function toggleQueryParam(resource: string, entityId: string) {
//   if (queryPrimsParams[resource as keyof FilterableResourceToEntityId]) {
//     const params = queryPrimsParams[resource as keyof FilterableResourceToEntityId];
//     const index = params.indexOf(entityId);

//     if (index !== -1) {
//       // Remove the ID if it exists
//       params.splice(index, 1);
//     } else {
//       // Add the ID if it doesn't exist
//       params.push(entityId);
//     }
//   }
// }

// // Function to clear child resource filters when parent resource changes
// export function clearChildResourceFilters(resource: ResourceType) {
//   const resourceOrder = ['organisation', 'project', 'layer', 'feature', 'task'];
//   const activeIndex = resourceOrder.indexOf(resource);

//   if (activeIndex >= 0) {
//     resourceOrder.slice(activeIndex + 1).forEach((childResource) => {
//       if (childResource in queryPrimsParams) {
//         queryPrimsParams[childResource as keyof FilterableResourceToEntityId] = [];
//       }
//     });
//   }
// }

// // Fetch resources for a given resource type
// export async function fetchResources(resource: ResourceType) {
//   if (resource) {
//     try {
//       // Build query parameters
//       const params = new URLSearchParams();

//       // Add filter parameters from queryPrimsParams
//       Object.entries(queryPrimsParams).forEach(([key, values]) => {
//         values.forEach((value) => params.append(key, value));
//       });

//       // Add additional filter parameters from queryFilterParams
//       Object.entries(queryFilterParams[resource] || {}).forEach(([key, value]) => {
//         if (value !== null) {
//           params.append(key, String(value));
//         }
//       });

//       const queryString = params.toString() ? `?${params.toString()}` : '';
//       const response = await fetch(`/api/${resourcePathMap[resource]}${queryString}`);

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }

//       const result = await response.json();
//       resources[resource] = result;

//       // Update filtered resources
//       updateFilteredResources(resource);
//     } catch (error) {
//       console.error(`Error fetching ${resource}:`, error);
//     }
//   }
// }

// // Update filtered resources based on filter text
// export function updateFilteredResources(resource: ResourceType) {
//   const filterText = filterTexts[resource].toLowerCase();

//   if (!filterText) {
//     filteredResources[resource] = resources[resource];
//   } else {
//     filteredResources[resource] = resources[resource].filter(
//       (entity) =>
//         entity.name?.toLowerCase().includes(filterText) ||
//         entity.nameShort?.toLowerCase().includes(filterText) ||
//         entity.title?.toLowerCase().includes(filterText) ||
//         entity.description?.toLowerCase().includes(filterText) ||
//         entity.ref?.toLowerCase().includes(filterText)
//     );
//   }
// }

// export const appMeta = { meta, context };
