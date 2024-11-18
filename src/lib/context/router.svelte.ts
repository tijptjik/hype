import { getContext, setContext } from 'svelte';
import type { FacetType, FalsableFacetType, FalsableRef, FalsableResourceType, ResourceType, Router } from '../types';

export class RouterState {
  state: Router = $state({
    resource: false,
    entity: false,
    facet: false
  });

  initialised = $state(false);

  urlState: URL = new URL(window.location.href);

  urlParts = () => this.urlState.pathname
      .replace(/^\/admin\//, '')
      .split('/')
      .filter(Boolean)

  refToResourceType: Record<string, ResourceType> = {
    organisations: 'organisation',
    projects: 'project',
    layers: 'layer',
    features: 'feature'
  };

  resourceToRef: Record<ResourceType, string> = Object.fromEntries(
    Object.entries(this.refToResourceType).map(([key, value]) => [value , key])
  );

  constructor() {}

  get resource(): FalsableResourceType {
    return this.state.resource;
  }

  get entity(): FalsableRef {
    return this.state.entity;
  }

  get facet(): FalsableFacetType {
    return this.state.facet;
  }

  set facet(facet: FalsableFacetType) {
    this.state.facet = facet;
  }

  get url(): URL {
    return this.urlState;
  }

  set url(url: URL) {
    this.urlState = url;
  }

  getResource = (): FalsableResourceType => {
    return this.refToResourceType[this.urlParts()[0]] || false;
  };

  getEntity = (): FalsableRef => {
    return this.urlParts()[1] || false;
  };

  getFacet = (): FalsableFacetType => {
    const facet = this.urlState.hash.slice(1);
    return facet ? (facet as FacetType) : false;
  };

  update = () => {
    const newUrl = new URL(window.location.href);
    if (!this.initialised || this.urlState.toString() !== newUrl.toString()) {
      this.urlState = newUrl;
      this.state = {
        resource: this.getResource(),
        entity: this.getEntity(),
        facet: this.getFacet()
      };
    }
  };
}

export const ROUTER_STATE_KEY = Symbol('routerState');

export const setRouterState = () => setContext(ROUTER_STATE_KEY, new RouterState());
export const getRouterState = () : ReturnType<typeof setRouterState> => getContext(ROUTER_STATE_KEY);
