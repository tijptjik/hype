<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// ICONS
import { PlusCircle, Swatch } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniCtx } from '$lib/context/omni.svelte';
// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature';

// PROPS
let {
  left,
  center,
  right
}: {
  left?: any;
  center?: any;
  right?: any;
} = $props();

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniCtx();

// HANDLERS
const handleAddFeature = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  await initAddNewFeature(appCtx, omniCtx, e);
};

const handleOpenCard = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  omniCtx.openCard();
};

const isAddButtonVisible = $derived(
  !omniCtx.isCardOpen &&
    !appCtx.isTransitioning &&
    !appCtx.getActiveFeature() &&
    !omniCtx.isNewFeatureMode &&
    appCtx.isMobile
);

const isCardToggleVisible = $derived(
  !omniCtx.isCardOpen &&
    !appCtx.isTransitioning &&
    appCtx.getActiveFeature() &&
    !omniCtx.isNewFeatureMode &&
    !center
);
</script>

<!-- MAPBAR -->
<div class="absolute bottom-0 left-0 right-0 z-40 p-4 px-3 pb-3 caret-transparent">
  <div class="grid grid-cols-3 items-center">
    <!-- LEFT -->
    <div class="flex items-center gap-2">
      {#if left}
        {@render left()}
      {:else if isAddButtonVisible}
        <button
          in:fade={{ duration: 300, delay: 150 }}
          out:fade={{ duration: 100, delay: 0 }}
          class="group btn btn-circle border-0 bg-transparent shadow-lg hover:text-primary"
          onclick={handleAddFeature}
          title={m.whole_house_cougar_hurl()}>
          <Icon
            src={PlusCircle}
            class="h-12 w-12 stroke-[1.5px] transition-transform duration-300 group-hover:rotate-90" />
        </button>
      {/if}
    </div>

    <!-- CENTER -->
    <div class="flex items-center justify-center gap-2">
      {#if center}
        {@render center()}
      {:else if isCardToggleVisible}
        <button
          in:fade={{ delay: 150 }}
          out:fade={{ duration: 100, delay: 0 }}
          class="btn z-30 bg-black text-white shadow-lg hover:text-primary"
          onclick={handleOpenCard}
          title={m.mapbar__show_card()}>
          <Icon src={Swatch} class="h-6 w-6 stroke-[2px]" />
          {m.mapbar__show_card()}
        </button>
      {/if}
    </div>

    <!-- RIGHT -->
    <div class="flex items-center justify-end gap-2">
      {#if right}
        {@render right()}
      {/if}
    </div>
  </div>
</div>
