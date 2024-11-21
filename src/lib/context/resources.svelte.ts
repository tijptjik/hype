import { getContext, setContext } from 'svelte';
import type { Organisation, Project, Layer, Feature, Id, ResourceType, Ref } from '../types';

type ResourceState = {
  organisation: Organisation | null;
  project: Project | null;
  layer: Layer | null;
  feature: Feature | null;
};

export class HierarchicalResourceState {
  state: ResourceState = $state({
    organisation: null,
    project: null,
    layer: null,
    feature: null
  });

  constructor() {}

  // Helper to determine resource level
  #getResourceLevel(resource: ResourceType): number {
    const levels: Record<ResourceType, number> = {
      organisation: 0,
      project: 1,
      layer: 2,
      feature: 3
    };
    return levels[resource];
  }

  // Clear all resources below the specified level
  #clearBelow(level: number) {
    const resources: ResourceType[] = ['organisation', 'project', 'layer', 'feature'];
    resources.forEach((resource) => {
      if (this.#getResourceLevel(resource) > level) {
        this.state[resource] = null;
      }
    });
  }

  // Fetch a entity by type and ID
  async #fetchEntity(
    resource: ResourceType,
    ref: Ref
  ): Promise<Organisation | Project | Layer | Feature | null> {
    try {
      const response = await fetch(`/api/${resource}s/${ref}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${resource}:`, error);
      return null;
    }
  }

  // Get parent resource
  #getParentType(resource: ResourceType): ResourceType | null {
    const parents: Partial<Record<ResourceType, ResourceType>> = {
      feature: 'layer',
      layer: 'project',
      project: 'organisation'
    };
    return parents[resource] || null;
  }

  // Get parent reference from resource
  #getParentRef(entity: Organisation | Project | Layer | Feature): string | null {
    if ('layerId' in entity) return entity.layerId;
    if ('projectId' in entity) return entity.projectId;
    if ('organisationId' in entity) return entity.organisationId;
    return null;
  }

  // Recursively fetch and set parent resources
  async #fetchParents(
    resource: ResourceType,
    entity: Organisation | Project | Layer | Feature
  ) {
    const parentType = this.#getParentType(resource);
    if (!parentType) return;

    const parentRef = this.#getParentRef(entity);
    if (!parentRef) return;

    if (!this.state[parentType]) {
      const parentEntity = await this.#fetchEntity(parentType, parentRef);
      if (parentEntity) {
        this.state[parentType] = parentEntity;
        await this.#fetchParents(parentType, parentEntity);
      }
    }
  }

  // Update the state with a new resource
  async update(resource: ResourceType, entity: Organisation | Project | Layer | Feature) {
    const level = this.#getResourceLevel(resource);
    
    // Clear all resources below this level
    this.#clearBelow(level);
    
    // Set the current resource
    this.state[resource] = entity;
    
    // Fetch any missing parent resources
    await this.#fetchParents(resource, entity);
  }
}

export const HIERARCHICAL_RESOURCE_STATE_KEY = Symbol('hierarchicalResourceState');

export const setHierarchicalResourceState = () => 
  setContext(HIERARCHICAL_RESOURCE_STATE_KEY, new HierarchicalResourceState());

export const getHierarchicalResourceState = (): ReturnType<typeof setHierarchicalResourceState> => 
  getContext(HIERARCHICAL_RESOURCE_STATE_KEY);
