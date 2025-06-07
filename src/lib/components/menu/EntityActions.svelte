<script lang="ts">
import { slide } from 'svelte/transition';
import { NEW_REF } from '$lib';
// COMPONENTS
import FormResetButton from './buttons/FormResetButton.svelte';
import FormSubmitButton from './buttons/FormSubmitButton.svelte';
import PublishButton from './buttons/PublishButton.svelte';
import ArchiveButton from './buttons/ArchiveButton.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';

let menuProps = $props();

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

let showFormControler = $derived(resourceState.state.active.facet !== 'images');
let showActionButton = $derived(
  resourceState.state.active.entity !== NEW_REF &&
    resourceState.state.active.entity !== false
);

// Resources that can be archived (all resources have isArchived)
const archiveableResources = [
  FirstClassResource.organisation, 
  FirstClassResource.project, 
  FirstClassResource.layer, 
  FirstClassResource.feature,
  FirstClassResource.hub
];

// Resources that can be published (but only when not SuperAdmin)
const publishableResources = [
  FirstClassResource.organisation, 
  FirstClassResource.project, 
  FirstClassResource.layer, 
  FirstClassResource.feature
];

let showArchiveButton = $derived(
  showActionButton && 
  archiveableResources.includes(resourceState.activeResource as FirstClassResource) &&
  resourceState.session?.user?.superAdmin === true
);

let showPublishButton = $derived(
  showActionButton && 
  publishableResources.includes(resourceState.activeResource as FirstClassResource)
);
</script>

<div class="join" in:slide={{ axis: 'x' }} out:slide={{ axis: 'x' }}>
  {#if showFormControler}
    <FormResetButton {...menuProps} />
    <FormSubmitButton {...menuProps} />
  {/if}
  {#if showArchiveButton}
    <ArchiveButton {...menuProps} />
  {/if}
  {#if showPublishButton}
    <PublishButton {...menuProps} />
  {/if}
</div>
