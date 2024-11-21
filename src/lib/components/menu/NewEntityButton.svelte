<script lang="ts">
import { goto } from '$app/navigation';
// COMPONENTS
import AssociationModal from '$lib/components/forms/modals/Association.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { ResourceType } from '$lib/types';

// STATE : CONTEXT
const routerState = getRouterState();

let modalOpen: (() => void) | null = $state(null);

// Handle modal ready event
function handleModalReady(event: CustomEvent) {
    modalOpen = event.detail.open;
}

const onclick = (e: MouseEvent) => {
    e.preventDefault();
    
    // If this resource type requires a parent association, show the modal
    if (requiresParentAssociation(routerState.resource as ResourceType)) {
        modalOpen?.();
        return;
    }

    routerState.updateWith({
        resource: routerState.resource,
        entity: 'new',
        facet: 'core'
    });
    // Otherwise, proceed with direct navigation
    const url = new URL(window.location.href);
    url.pathname = `/admin/${routerState.resourcePath}/new`;
    goto(url.toString());
};

type ResourceTypeWithParent = Exclude<ResourceType, 'organisation'>

const associationMap: Record<ResourceTypeWithParent, ResourceType> = {
    'project': 'organisation',
    'layer': 'project',
    'feature': 'layer',
};

function requiresParentAssociation(resource: ResourceType): boolean {
    return resource in associationMap;
}

// Helper function to get parent resource type
function getParentResourceType(resource: ResourceTypeWithParent): ResourceType | null {
    return associationMap[resource] || null;
}
</script>

<button {onclick} class="btn btn-sm btn-primary text-white">
  ADD
</button>

{#if requiresParentAssociation(routerState.resource as ResourceType)}
    <AssociationModal
        parentResourceType={getParentResourceType(routerState.resource as ResourceTypeWithParent) as ResourceType}
        childResourceType={routerState.resource as ResourceTypeWithParent}
        on:ready={handleModalReady}
    />
{/if}