<script lang="ts">
// SVELTE
import { goto } from '$app/navigation';
// I18N
import { i18n } from '$lib/i18n';
// ACTIONS
import { clickOutside } from '$lib/actions';
// Animation
import { fade, scale } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext, PageState } from '$lib/context/omni.svelte';

// CONTEXT
let mapContext = getMapContext();
let omniContext = getOmniContext();

// STATE : PROPS
let { children }: { children: any } = $props();

// STATE : DERIVED
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = mapContext.state.panels;
  const leftPanelOpen = maps || stars;
  const rightPanelOpen = filters || settings;
  return leftPanelOpen && rightPanelOpen
    ? 0
    : leftPanelOpen
      ? 420 / 2
      : rightPanelOpen
        ? -420 / 2
        : 0;
});

// PAGE STATE HANDLING
function handleOutroStart() {
  if (omniContext.pageState === PageState.NeedTransition) {
    omniContext.pageState = PageState.Transitioning;
  }
}

function handleOutroEnd() {
  if (omniContext.pageState === PageState.Transitioning) {
    omniContext.pageState = PageState.ReadyToNav;
    omniContext.clearSearch();
    omniContext.setMode('search');
    omniContext.focusSearchBar();
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target?.dataset?.type === 'marker') {
    const featureId = target.dataset.featureId;
    if (featureId) {
      omniContext.handleFeatureSelection(mapContext, featureId);
    }
  } else if (target.localName === 'canvas') {
    omniContext.pageState = PageState.NeedTransition;
    omniContext.closeCard();
    omniContext.pageState = PageState.Transitioning;
    goto(i18n.resolveRoute('/'));
  }
}
</script>

{#if omniContext.state.isCardOpen}
  <div
    class="min-h-auto pointer-events-none relative mx-auto mt-8 flex w-full max-w-[520px] flex-grow flex-col justify-center p-0 duration-300 w-92:px-6"
    style="transform: translateX({horizontalOffset()}px); z-index: 4;">
    <div
      class="flex w-full max-w-[520px] flex-grow flex-col justify-center gap-4 px-0"
      in:scale={{
        duration: 300,
        delay: 300,
        easing: cubicInOut,
        start: 1,
        opacity: 0.3
      }}
      out:scale={{ duration: 300, easing: cubicInOut, start: 1, opacity: 0.3 }}
      onoutrostart={handleOutroStart}
      onoutroend={handleOutroEnd}
      use:clickOutside={(e) => handleClickOutside(e)}>
      <div
        id="feature-card"
        class="relative w-full overflow-visible rounded-lg shadow-xl">
        {@render children()}
      </div>
    </div>
  </div>
{:else}
  <div
    class="fixed inset-x-[24px] z-50"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}>
    <div
      class="mx-auto w-fit translate-y-[42vh] rounded-full bg-black p-4 text-center text-2xl text-base-content">
      <div class="flex items-center justify-center gap-2">
        <span class="loading loading-ring"></span>
      </div>
    </div>
  </div>
{/if}
