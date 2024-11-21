<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { MapPin } from '@steeze-ui/heroicons';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FeatureForm, EntityRouter } from '$lib/types';

// CONFIG
const coordinateLabels = ['Latitude', 'Longitude'];

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE : PROPS
let extraProps: { form: FeatureForm } = $props();

// STATE : CONTEXT
let { form } = extraProps.form;
</script>

<div class="flex flex-row gap-6 items-center">
  <Icon src={MapPin} class="h-6 w-6" />
  {#each coordinateLabels as label, index}
    <div class="flex flex-row items-center gap-3">
      <p class="text-sm font-spaced">{label}</p>
      <pre class="text-lg font-light font-mono text-base-content/50">{$form.geometry.coordinates[index].toFixed(5)}</pre>
    </div>
  {/each}
</div>


