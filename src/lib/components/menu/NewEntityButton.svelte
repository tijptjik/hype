<script lang="ts">
import type { ResourceType } from '$lib/types';
import { getRouterState } from '$lib/context/router.svelte';
import { goto } from '$app/navigation';
import AssociationModal from '$lib/components/forms/FormModalAssociation.svelte';

// STATE : PROPS
const props = $props<{
    resourceType: ResourceType;
}>();

// STATE : CONTEXT
const routerState = getRouterState();

let modalOpen: (() => void) | null = $state(null);

// Handle modal ready event
function handleModalReady(event: CustomEvent) {
    modalOpen = event.detail.open;
}

const onclick = (e: MouseEvent) => {
    console.log('onclick', props.resourceType);
    e.preventDefault();
    
    // If this resource type requires a parent association, show the modal
    if (requiresParentAssociation(props.resourceType)) {
      console.log('requiresParentAssociation', props.resourceType);
        modalOpen?.();
        return;
    }

    // Otherwise, proceed with direct navigation
    const url = new URL(window.location.href);
    url.pathname = `/admin/${routerState.resourceToRef[props.resourceType as keyof typeof routerState.resourceToRef]}/new`;
    goto(url.toString());
};

const associationMap: Record<Exclude<ResourceType, 'organisation'>, ResourceType> = {
    'project': 'organisation',
    'layer': 'project',
    'feature': 'layer',
};

function requiresParentAssociation(resourceType: ResourceType): boolean {
    return resourceType in associationMap;
}

// Helper function to get parent resource type
function getParentResourceType(resourceType: ResourceType): ResourceType | null {
    return associationMap[resourceType as keyof typeof associationMap] || null;
}
</script>

<button {onclick} class="btn btn-sm btn-primary text-white">
  ADD
</button>

{#if requiresParentAssociation(props.resourceType)}
    <AssociationModal
        parentResourceType={getParentResourceType(props.resourceType) as ResourceType}
        childResourceType={props.resourceType}
        on:ready={handleModalReady}
    />
{/if}