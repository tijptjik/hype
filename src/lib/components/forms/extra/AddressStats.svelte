<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { MapPin } from '@steeze-ui/heroicons';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { Feature, SectionProps } from '$lib/types';

// STATE : PROPS
let { entity, resource }: SectionProps = $props();

// STATE : CONTEXT
const { form } = getForm<Feature>(resource, entity);

const coordinateLabels = ['Latitude', 'Longitude'];
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


