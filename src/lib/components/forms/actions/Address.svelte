<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass, GlobeAsiaAustralia } from '@steeze-ui/heroicons';
// TYPES
import type { FeatureForm } from '$lib/types';

// STATE : PROPS
let {
  actions,
  ...actionProps
}: { form: FeatureForm; actions: Record<string, (...args: any[]) => void> } = $props();

// STATE : CONTEXT :: FORM
let { form } = actionProps.form;

// STATE : DERIVED :: GEOMETRY
let [lng, lat] = $derived($form.geometry.coordinates);
</script>

<div class="flex flex-row items-center gap-4">
  <a
    draggable="false"
    class="btn-rounded group btn btn-circle select-none bg-neutral transition-colors duration-300 hover:bg-neutral-content/20"
    href={`https://earth.google.com/web/@${lat},${lng}`}
    target="_blank"
    aria-label="View on Google Earth">
    <Icon
      src={GlobeAsiaAustralia}
      class="transition-size h-[2rem] w-[2rem] duration-300 hover:rotate-6 group-hover:scale-110" />
  </a>
  <button
    class="btn-rounded btn bg-fuchsia-700 text-base-content transition-colors duration-300 hover:bg-fuchsia-800"
    onclick={actions.geocode}>
    <Icon src={MagnifyingGlass} class="h-4 w-4" />
    <span class="hidden md:block"> Geocode </span>
  </button>
</div>
