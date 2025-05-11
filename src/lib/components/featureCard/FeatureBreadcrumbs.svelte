<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import {
  Squares2x2,
  EllipsisVertical,
  ExclamationCircle,
  Camera
} from '@steeze-ui/heroicons';
// Svelte
import { clickOutside } from '$lib/actions';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
// TYPES
import type { Feature } from '$lib/types';
// ENUMS
import { FeatureCardMode } from '$lib/types';

// CONTEXT
const cardCtx = getFeatureCardContext();

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : LOCAL
let menuOpen = $state(false);

// CONTEXT
const mapCtx = getMapContext();

// FUNCTIONS
function toggleMenu(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  menuOpen = !menuOpen;
  if (menuOpen) {
    document.getElementById('feature-card-menu')?.focus();
  }
}

function closeMenu(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  menuOpen = false;
}
let layer = mapCtx.getLayer(feature);
let project = mapCtx.getProject(layer!);
let organisation = mapCtx.getOrganisation(project!);
</script>

<div
  class="pointer-events-auto flex w-full flex-shrink-0 items-center justify-between bg-black pl-2 w-100:pl-4">
  <div class="flex items-center gap-2 font-mono text-xs uppercase text-neutral-content">
    <Icon src={Squares2x2} class="h-6 w-6" />
    <span class="text-xs uppercase">{organisation?.code}</span>
    <span class="text-gray-400">›</span>
    <span class="text-xs uppercase">{project?.code}</span>
    <!-- Only show if the layer if there are multiple layers active for the same project -->
    {#if layer}
      <div class="hidden md:block">
        <span class="text-gray-400">›</span>
        <span>{layer.name}</span>
      </div>
    {/if}
  </div>

  <div class="relative">
    <button
      class="btn btn-ghost btn-sm rounded-none rounded-bl-lg p-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
      onclick={(e) => toggleMenu(e)}>
      <Icon src={EllipsisVertical} class="h-6 w-6 -translate-y-[1px]" />
    </button>

    {#if menuOpen}
      <div
        id="feature-card-menu"
        class="absolute -top-[90px] right-1.5 mt-1 w-48 rounded-lg rounded-br-none bg-black p-0 caret-transparent shadow-xl"
        use:clickOutside={(e) => closeMenu(e)}>
        <button
          class="btn btn-ghost btn-sm h-auto w-full justify-start gap-2 rounded-b-none p-2 pl-3 font-mono font-thin text-neutral-content hover:bg-base-300 active:scale-100 active:bg-base-200"
          onclick={() => (cardCtx.state.mode = FeatureCardMode.Missing)}>
          <Icon src={ExclamationCircle} class="h-5 w-5 text-primary" theme="solid" />
          Report Missing
        </button>
        <button
          class="btn btn-ghost btn-sm h-auto w-full justify-start gap-2 rounded-t-none rounded-br-none p-2 pl-3 font-mono font-thin text-neutral-content hover:bg-base-300 active:scale-100 active:bg-base-200"
          onclick={() => (cardCtx.state.mode = FeatureCardMode.AddPhoto)}>
          <Icon src={Camera} class="h-5 w-5 text-primary" theme="solid" />
          Add Photo
        </button>
      </div>
    {/if}
  </div>
</div>
