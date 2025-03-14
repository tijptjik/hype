// import { SvelteURL } from 'svelte/reactivity';
// import { getContext, setContext } from 'svelte';
// import { Facets } from '../types';
// import type {
//   FacetType,
//   FalsableFacetType,
//   FalsableRef,
//   FalsableResourceType,
//   ResourceType
// } from '../types';

// export class RouterState {
//   #urlState = $state(new SvelteURL(window.location.href));

//   #urlParts: string[] = $derived(
//     this.#urlState.pathname
//       .replace(/^\{ADMIN_PATH}\//, '')
//       .split('/')
//       .filter(Boolean)
//   );

//   #refToResourceType: Record<string, ResourceType> = {
//     organisations: 'organisation',
//     projects: 'project',
//     layers: 'layer',
//     features: 'feature'
//   };

//   resourceToRef: Record<ResourceType, string> = Object.fromEntries(
//     Object.entries(this.#refToResourceType).map(([key, value]) => [value, key])
//   ) as Record<ResourceType, string>;

//   get url(): SvelteURL {
//     return this.#urlState;
//   }

//   get resourcePath(): string {
//     return this.resourceToRef[this.resource as keyof typeof this.resourceToRef];
//   }

//   #getResource = (): FalsableResourceType => {
//     return this.#refToResourceType[this.#urlParts[0]] ?? false;
//   };

//   #getEntity = (): FalsableRef => {
//     return this.#urlParts[1] ?? false;
//   };

//   #getFacet = (hash?: string): FalsableFacetType => {
//     // Default to false for resource views
//     if (!this.#getEntity()) {
//       return false;
//       // Intercept hash from URL on load
//     } else if (hash) {
//       const potentialFacet = hash.slice(1) as FacetType;
//       if (Facets.includes(potentialFacet)) {
//         return potentialFacet;
//       }
//     }
//     // Default to 'core' for entity views
//     else if (this.#getEntity() && !this.facet) {
//       return 'core';
//     }
//     // Other changes are manually handled
//     return this.facet;
//   };

//   resource = $state<FalsableResourceType>(false);
//   entity = $state<FalsableRef>(false);
//   facet = $state<FalsableFacetType>(false);

//   constructor() {
//     this.update();
//   }

//   update = (url?: string) => {
//     console.log('update', url);
//     if (url) {
//       this.#urlState = new SvelteURL(url);
//     }
//     let resource = this.#getResource();
//     let entity = this.#getEntity();
//     let facet = this.#getFacet(this.#urlState.hash);
//     console.log('updateWith', { resource, entity, facet });
//     this.updateWith({ resource, entity, facet });
//   };

//   updateWith = ({
//     resource,
//     entity,
//     facet
//   }: {
//     resource?: FalsableResourceType;
//     entity?: FalsableRef;
//     facet?: FalsableFacetType;
//   }) => {
//     // Update URL
//     let currentUrl = new SvelteURL(window.location.href);
//     currentUrl.pathname = `{ADMIN_PATH}/${this.resourceToRef[resource as ResourceType]}/${entity}`;
//     console.log('updateWith', { currentUrl, urlState: this.#urlState });
//     if (currentUrl.pathname !== this.#urlState.pathname) {
//       this.#urlState = currentUrl;
//     }
//     // Update State
//     if (resource !== undefined && resource !== this.resource) {
//       this.resource = resource;
//     }
//     if (entity !== undefined && entity !== this.entity) {
//       this.entity = entity;
//     }
//     if (facet !== undefined && facet !== this.facet) {
//       this.facet = facet;
//     }
//     console.log('updateWith', {
//       resource: this.resource,
//       entity: this.entity,
//       facet: this.facet
//     });
//   };
// }

// export const ROUTER_STATE_KEY = Symbol('routerState');

// export const setRouterState = () => setContext(ROUTER_STATE_KEY, new RouterState());
// export const getRouterState = (): ReturnType<typeof setRouterState> =>
//   getContext(ROUTER_STATE_KEY);
