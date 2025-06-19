<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import {
  Squares2x2,
  EllipsisVertical,
  PencilSquare,
  ExclamationCircle,
  Camera
} from '@steeze-ui/heroicons';
// Svelte
import { clickOutside } from '$lib/actions';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// TYPES
import type { Feature, UserContributedFeature, ResourceContext } from '$lib/types';

// CONTEXT
const cardCtx = getFeatureCardContext();
const omniCtx = getOmniContext();
const appCtx = getAppCtx();

// STATE : PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// STATE : LOCAL
let menuOpen = $state(false);

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

function showLayerSelectionModal() {
  omniCtx.closeCard();
  window.dispatchEvent(new CustomEvent('showLayerSelectionModal'));
}
</script>

{#if appCtx.isInitialised}
  {#await appCtx.getHierarchy(feature as Feature)}
    <div
      class="pointer-events-auto flex w-full flex-shrink-0 items-center justify-between bg-black pl-2 w-100:pl-4">
      <div
        class="flex items-center gap-2 font-mono text-xs uppercase text-neutral-content">
        <Icon src={Squares2x2} class="h-6 w-6" />
        <div class="loading loading-spinner loading-xs"></div>
      </div>
    </div>
  {:then hierarchy}
    {@const organisationName = appCtx.getContextualOrganisationName(
      hierarchy.organisation!,
      false
    )}
    {@const projectName = appCtx.getContextualProjectName(hierarchy.project)}
    {@const layerName = appCtx.getContextualLayerName(hierarchy.layer!)}
    <div
      class="pointer-events-auto flex w-full flex-shrink-0 items-center justify-between bg-black pl-2 w-100:pl-4">
      <div
        class="flex items-center gap-2 font-mono text-xs uppercase text-neutral-content">
        <Icon src={Squares2x2} class="h-6 w-6" />
        <span class="text-xs uppercase">
          {organisationName}
        </span>
        {#if hierarchy.project && projectName}
          <div transition:fade={{ duration: 300 }}>
            <span class="text-gray-400">›</span>
            <span class="text-xs uppercase">
              {projectName}
            </span>
          </div>
        {/if}
        {#if hierarchy.layer && layerName}
          <div class="hidden md:block" transition:fade={{ duration: 300 }}>
            <span class="text-gray-400">›</span>
            <span>{layerName}</span>
          </div>
        {/if}
      </div>

      <div class="relative caret-transparent">
        {#if cardCtx.isNewMode}
          <button
            class="btn btn-ghost btn-sm rounded-none rounded-bl-lg px-3 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200"
            onclick={showLayerSelectionModal}>
            <Icon src={PencilSquare} class="h-5 w-5 -translate-y-[1px]" />
          </button>
        {:else}
          <button
            class="btn btn-ghost btn-sm rounded-none rounded-bl-lg p-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200"
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
                <Icon
                  src={ExclamationCircle}
                  class="h-5 w-5 text-primary"
                  theme="solid" />
                {m.such_that_rabbit_pull()}
              </button>
              <button
                class="btn btn-ghost btn-sm h-auto w-full justify-start gap-2 rounded-t-none rounded-br-none p-2 pl-3 font-mono font-thin text-neutral-content hover:bg-base-300 active:scale-100 active:bg-base-200"
                onclick={() => (cardCtx.state.mode = FeatureCardMode.AddPhoto)}>
                <Icon src={Camera} class="h-5 w-5 text-primary" theme="solid" />
                {m.mushy_level_slug_pray()}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {:catch error}
    <div
      class="pointer-events-auto flex w-full flex-shrink-0 items-center justify-between bg-black pl-2 w-100:pl-4">
      <div
        class="flex items-center gap-2 font-mono text-xs uppercase text-neutral-content">
        <Icon src={Squares2x2} class="h-6 w-6" />
        <span class="text-red-400">Error loading hierarchy</span>
      </div>
    </div>
  {/await}
{/if}
