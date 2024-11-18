<script lang="ts">
import { MagnifyingGlass, GlobeAsiaAustralia } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { SectionProps, Feature } from '$lib/types';

// STATE : PROPS
let {
  entity,
  resource,
  actions
}: SectionProps & { actions: Record<string, (...args: any[]) => void> } = $props();

// STATE : CONTEXT
const { form } = getForm<Feature>(resource, entity);
let [lng, lat] = $derived($form.geometry.coordinates);

</script>

<div class="flex flex-row items-center gap-4">
  <a
    class="group btn btn-rounded btn-circle bg-neutral hover:bg-neutral-content/20 transition-colors duration-300"
    href={`https://earth.google.com/web/@${lat},${lng}`}
    target="_blank"
    aria-label="View on Google Earth">
    <Icon src={GlobeAsiaAustralia} class="h-[2rem] w-[2rem] transition-size duration-300 group-hover:scale-110 hover:rotate-6" />
  </a>
  <button
    class="btn btn-rounded bg-fuchsia-700 text-base-content hover:bg-fuchsia-800 transition-colors duration-300"
    onclick={actions.geocode}>
    <Icon src={MagnifyingGlass} class="h-4 w-4" />
    <span class="hidden md:block"> Geocode </span>
  </button>
</div>
