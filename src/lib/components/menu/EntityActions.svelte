<script lang="ts">
import { slide } from 'svelte/transition';
import { NEW_REF } from '$lib';
// COMPONENTS
import FormResetButton from './FormResetButton.svelte';
import FormSubmitButton from './FormSubmitButton.svelte';
import PublishButton from './PublishButton.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { EntityRouter } from '$lib/types';

let menuProps = $props();

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

let showFormControler = $derived(
  routerState.facet !== 'images'
);
let showPublishButton = $derived(
  (routerState.resource === 'project' ||
    routerState.resource === 'layer' ||
    routerState.resource === 'feature') &&
  (routerState.entity !== NEW_REF && routerState.entity !== false)
);

console.log(routerState.entity);
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
