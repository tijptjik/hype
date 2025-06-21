<script lang="ts">
// SVELTE
// I18n
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle, QueueList } from '@steeze-ui/heroicons';
// COMPONENTS
import ScrollableText from '$lib/components/common/ScrollableText.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// TYPES
import type { Feature } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

// DERIVED -- Titles
let collectionTitle = $derived(
  omniCtx.isFeatureMode
    ? (() => {
        const feature = appCtx.getActiveFeature();
        return feature
          ? getI18n(feature, 'displayAddress', {
              ...appCtx.getUserPreferences(),
              allowMachineTranslation: true
            })
          : '';
      })()
    : (() => {
        const collection = appCtx.getActiveCollection();
        return collection
          ? getI18n(collection, 'name', appCtx.getUserPreferences(), m.place())
          : '';
      })()
);
let featureTitle = $derived(
  getI18n(
    appCtx.state.active.feature!,
    'title',
    appCtx.getUserPreferences(),
    m.deft_dry_chipmunk_blink()
  )
);

let newFeatureTitle = $derived(
  getI18n(
    appCtx.getNewFeature() as Feature,
    'title',
    appCtx.getUserPreferences(),
    m.day_chunky_okapi_cherish()
  )
);

// DERIVED -- Collection Index and Size
let index = $derived(omniCtx.navIndex + 1);
let collectionSize = $derived(appCtx.getActiveCollection()?.items.length);

// DERIVED -- Mode
let collectionMode = $derived(omniCtx.state.mode);
let isNotFeatureMode = $derived(collectionMode !== 'feature');
let isNewFeatureMode = $derived(collectionMode === 'new-feature');

let fullCollectionText = $derived(
  isNewFeatureMode
    ? m.smart_crazy_cuckoo_play()
    : isNotFeatureMode
      ? `${collectionTitle} (${index} of ${collectionSize})`
      : collectionTitle
);
</script>

<div
  class="flex w-full select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {isNotFeatureMode &&
  !isNewFeatureMode
    ? 'px-0'
    : 'px-6'}">
  <div
    class="min-w-0 flex-1 overflow-hidden transition-[height]"
    onclick={() => omniCtx.toggleCard()}>
    <div class="flex items-start gap-3">
      {#if isNotFeatureMode && !isNewFeatureMode}
        <button
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80 focus:outline-none"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            omniCtx.closeCard();
            omniCtx.toggleTray(e);
          }}>
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div
        class="flex min-w-0 flex-1 -translate-y-0.5 flex-col overflow-hidden transition-[height] duration-300">
        <!-- Collection Title -->
        <ScrollableText
          text={fullCollectionText}
          containerClass="h-[22px] pt-1.5"
          textClass="text-xs text-base-content/60"
          separator="~"
          padding={20} />

        <!-- Feature Title -->
        <ScrollableText
          text={isNewFeatureMode ? newFeatureTitle : featureTitle}
          containerClass="h-6"
          textClass="font-medium"
          separator="~"
          padding={20} />
      </div>
    </div>
  </div>

  <button
    class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      omniCtx.close();
    }}>
    <Icon
      src={XCircle}
      class="h-10 w-10 transition-transform duration-300 {omniCtx.state.isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}" />
  </button>
</div>

<style>
</style>
