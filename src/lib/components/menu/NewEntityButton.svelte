<script lang="ts">
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// LIB
import { NEW_REF } from '$lib/index';
// COMPONENTS
import AssociationModal from '$lib/components/forms/modals/Association.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource, HierarchicalResource } from '$lib/enums';

// STATE : CONTEXT
const adminCtx = getAdminCtx();

let modalOpen: boolean = $state(false);

const onclick = (e: MouseEvent) => {
  e.preventDefault();
  // Set facet to false
  adminCtx.setFacet(false);
  if (
    requiresParentAssociation(
      adminCtx.activeResourceType as unknown as HierarchicalResource
    )
  ) {
    // Let the user pick the parent to be associated with
    modalOpen = true;
  } else {
    // Directly navigate to the new entity page
    navigateOnAdmin(
      adminCtx,
      adminCtx.activeResourceType as FirstClassResource,
      NEW_REF,
      'core'
    );
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
