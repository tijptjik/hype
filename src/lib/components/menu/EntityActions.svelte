<script lang="ts">
import { slide } from 'svelte/transition';
import { NEW_REF } from '$lib';
// COMPONENTS
import FormResetButton from './FormResetButton.svelte';
import FormSubmitButton from './FormSubmitButton.svelte';
import PublishButton from './PublishButton.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';

let menuProps = $props();

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

let showFormControler = $derived(resourceState.state.active.facet !== 'images');
let showPublishButton = $derived(
  resourceState.state.active.entity !== NEW_REF &&
    resourceState.state.active.entity !== false
);
</script>

{#if showFormControler}
  <div class="flex flex-row gap-2" in:slide={{ axis: 'x' }} out:slide={{ axis: 'x' }}>
    <li>
      <FormResetButton {...menuProps} />
    </li>
    <li>
      <FormSubmitButton {...menuProps} />
    </li>
  </div>
{/if}
{#if showPublishButton}
  <div class="flex flex-row gap-2" in:slide={{ axis: 'x' }} out:slide={{ axis: 'x' }}>
    <li>
      <PublishButton {...menuProps} />
    </li>
  </div>
{/if}
