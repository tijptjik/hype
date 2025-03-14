<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
// I18N
import { i18n } from '$lib/i18n';
// LIB
import { ADMIN_PATH, NEW_REF } from '$lib/index';
// COMPONENTS
import AssociationModal from '$lib/components/forms/modals/Association.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { ResourceType } from '$lib/types';

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

let modalOpen: (() => void) | null = $state(null);

// Handle modal ready event
function handleModalReady(event: CustomEvent) {
  modalOpen = event.detail.open;
}

const onclick = (e: MouseEvent) => {
  e.preventDefault();

  // If this resource type requires a parent association, show the modal
  if (
    requiresParentAssociation(
      resourceState.state.active.resource as HierarchicalResource
    )
  ) {
    modalOpen?.();
    return;
  }

  // routerState.updateWith({
  //     resource: routerState.resource,
  //     entity: NEW_REF,
  //     facet: 'core'
  // });
  // Otherwise, proceed with direct navigation
  const url = new URL(window.location.href);
  url.pathname = `${ADMIN_PATH}/${resourceState.getResourcePath()}/new`;
  goto(i18n.resolveRoute(url.toString()));
};

type ResourceTypeWithParent = Exclude<
  HierarchicalResource,
  HierarchicalResource.organisation
>;

const associationMap: Record<ResourceTypeWithParent, HierarchicalResource> = {
  project: HierarchicalResource.organisation,
  layer: HierarchicalResource.project,
  feature: HierarchicalResource.layer,
  task: HierarchicalResource.feature
};

function requiresParentAssociation(resource: HierarchicalResource): boolean {
  return resource in associationMap;
}

// Helper function to get parent resource type
function getParentResourceType(
  resource: ResourceTypeWithParent
): HierarchicalResource | null {
  return associationMap[resource] || null;
}
</script>

<button {onclick} class="btn btn-primary btn-sm text-white"> ADD </button>

{#if requiresParentAssociation(resourceState.state.active.resource as HierarchicalResource)}
  <AssociationModal
    parentResourceType={getParentResourceType(
      resourceState.state.active.resource as ResourceTypeWithParent
    ) as HierarchicalResource}
    childResourceType={resourceState.state.active.resource as ResourceTypeWithParent}
    on:ready={handleModalReady} />
{/if}
