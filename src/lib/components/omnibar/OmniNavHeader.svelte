<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle, QueueList } from '@steeze-ui/heroicons';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// I18N
import { getI18nValue } from '$lib/i18n';

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();

// DERIVED

// DERIVED -- Titles
let collectionTitle = $derived(getI18nValue(mapContext.getActiveCollection(), 'name'));
let featureTitle = $derived(getI18nValue(mapContext.getActiveFeature(), 'title'));

// DERIVED -- Collection Index and Size
let index = $derived(omniContext.navIndex + 1);
let collectionSize = $derived(mapContext.getActiveCollection()?.items.length);

// DERIVED -- Mode
let collectionMode = $derived(omniContext.state.mode);
let isNotFeatureMode = $derived(collectionMode !== 'feature');
</script>

<div
  class="items-start flex w-full select-none justify-between py-2 transition-[height] {isNotFeatureMode
    ? 'pl-2 pr-2'
    : 'pl-6 pr-4'}">
  <div class="flex flex-col items-start transition-[height]" onclick={() => omniContext.toggleCard()}>
    <div class="flex items-start gap-3">
      {#if isNotFeatureMode}
        <button
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80"
          onclick={(e) => omniContext.toggleTray(e)}>
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div class="flex flex-col items-start transition-[height] duration-300">
        <span class="text-xs text-base-content/60"
          >{collectionTitle}
          {#if isNotFeatureMode}
            <span>({index} of {collectionSize})</span>
          {/if}
        </span>
        <span class="block font-medium transition-[height] duration-300 pr-3">{featureTitle}</span>
      </div>
    </div>
  </div>

  <button
    class="btn btn-ghost btn-sm m-0 h-auto p-0 hover:bg-transparent hover:text-base-content/80"
    onclick={() => omniContext.close()}>
    <Icon
      src={XCircle}
      class="h-10 w-10 transition-transform duration-300 {omniContext.state.isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}" />
  </button>
</div>
