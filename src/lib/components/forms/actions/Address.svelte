<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass, GlobeAsiaAustralia } from '@steeze-ui/heroicons';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { EntityRouter, FeatureForm} from '$lib/types';

// STATE : PROPS
let { actions, ...actionProps }: { form: FeatureForm, actions: Record<string, (...args: any[]) => void> } = $props();

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE : CONTEXT :: FORM
let { form } = actionProps.form;
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
