<script lang="ts">
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
</script>

<li>
  <FormResetButton {...menuProps}/>
</li>
<li>
  <FormSubmitButton {...menuProps} />
</li>
{#if routerState.resource === 'project' || routerState.resource === 'layer' || routerState.resource === 'feature'}
  <li>
    <PublishButton {...menuProps} />
  </li>
{/if}
