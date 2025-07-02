<script lang="ts">
import { slide } from 'svelte/transition';
import { NEW_REF } from '$lib';
// COMPONENTS
import FormResetButton from './buttons/FormResetButton.svelte';
import FormSubmitButton from './buttons/FormSubmitButton.svelte';
import PublishButton from './buttons/PublishButton.svelte';
import DeleteButton from './buttons/DeleteButton.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';

let menuProps = $props();

// STATE : CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

let showFormControler = $derived(adminCtx.activeFacet !== 'images');
let showActionButton = $derived(
  adminCtx.activeResourceRef !== NEW_REF && adminCtx.activeResourceRef !== false
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
    archiveableResources.includes(adminCtx.activeResourceType as FirstClassResource) &&
    adminCtx.appCtx?.user?.superAdmin === true
);

let showPublishButton = $derived(
  showActionButton &&
    publishableResources.includes(adminCtx.activeResourceType as FirstClassResource)
);
</script>

<div class="join" in:slide={{ axis: 'x' }} out:slide={{ axis: 'x' }}>
  {#if showFormControler}
    <FormResetButton {...menuProps} />
    <FormSubmitButton {...menuProps} />
  {/if}
  {#if showArchiveButton}
    <DeleteButton {...menuProps} />
  {/if}
  {#if showPublishButton}
    <PublishButton {...menuProps} />
  {/if}
</div>
