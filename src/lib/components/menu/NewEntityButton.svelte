<script lang="ts">
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// LIB
import { NEW_REF } from '$lib/index';
// COMPONENTS
import AssociationModal from '$lib/components/forms/modals/Association.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

let modalOpen: boolean = $state(false);

const onclick = (e: MouseEvent) => {
  e.preventDefault();
  if (requiresParentAssociation(resourceState.activeResource as HierarchicalResource)) {
    modalOpen = true;
  } else {
    navigateOnAdmin(resourceState.activeResource as HierarchicalResource, NEW_REF);
  }
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

let requiresParentAssociation = (resource: HierarchicalResource): boolean => {
  return resource in associationMap;
};
</script>

<button {onclick} class="btn btn-primary btn-sm text-white"> ADD </button>

{#if modalOpen}
  <AssociationModal bind:isOpen={modalOpen} />
{/if}
