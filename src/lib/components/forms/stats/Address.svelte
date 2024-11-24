<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { MapPin } from '@steeze-ui/heroicons';
import { fade } from 'svelte/transition';
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

// HANDLERS
function copyCoordinates() {
  const coords = $form.geometry.coordinates.join(',');
  navigator.clipboard.writeText(coords);
}
</script>

<div class="flex flex-row items-center gap-6 select-none">
  <Icon 
    src={MapPin} 
    class="h-6 w-6 cursor-pointer hover:text-content/70 active:text-neutral-content select-none"
    onclick={copyCoordinates}
  />
  {#each coordinateLabels as label, index}
    <div class="flex flex-row items-center gap-3 select-none">
      <p class="font-spaced text-sm">{label}</p>
      {#key $form.geometry.coordinates}
        <pre
          in:fade={{ duration: 300 }}
          class="font-mono text-lg font-light text-base-content/50">{$form.geometry.coordinates[
            index
          ].toFixed(5)}</pre>
      {/key}
    </div>
  {/each}
</div>
