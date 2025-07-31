<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import { Star, Check, PencilSquare } from '@steeze-ui/heroicons';
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// SERVICES
import {
  updateNewFeatureProperty,
  getFeatureCardEditableProperties
} from '$lib/client/services/property';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getCardCtx } from '$lib/context/card.svelte';
// Types
import type { Id, Feature, UserContributedFeature, FeatureProperty } from '$lib/types';

// HTML ELEMENTS
let titleInput: HTMLInputElement = $state()!;

// STATE : PROPS
let {
  feature
}: {
  feature: Feature | UserContributedFeature;
  hideDescription?: boolean;
} = $props();

// CONTEXT
const appCtx = getAppCtx();
const cardCtx = getCardCtx();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// STATE : LOCAL
let gradePropertyId: Id = $derived(
  appCtx.cache.layer.get(feature.layerId)?.properties?.find((p: any) => {
    const property = appCtx.cache.property.get(p.propertyId);
    return property?.key === 'grade';
  })?.propertyId
) as Id;

let grade = $derived(
  (feature.properties as FeatureProperty[])?.find(
    (p) => p.propertyId === gradePropertyId
  )?.value || ''
);
let isEditing = $state(false);
let title = $derived(
  getI18n(feature as Feature, 'title', userPreferences, m.empty_lofty_meerkat_support())
);
let originalTitle = $state('');

function handleEditMode(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  originalTitle = title;
  // Clear title if it's the placeholder value
  if (title === m.empty_lofty_meerkat_support()) {
    title = '';
  }
  isEditing = true;
  // focus the title input
  setTimeout(() => {
    titleInput.focus();
  }, 0);
}

// Update the feature title in the context
function handleTitleSubmit() {
  if (title.trim()) {
    isEditing = false;
    if (cardCtx.isNewMode) {
      appCtx.updateNewFeatureValueI18n('title', title);
    }
  }
}

function handleTitleCancel() {
  title = originalTitle;
  isEditing = false;
}

function handleGradeSelect(newGrade: number) {
  updateNewFeatureProperty(appCtx, gradePropertyId, {
    propertyId: gradePropertyId,
    value: newGrade.toString()
  });
}

// FUNCTIONS
// Available properties that could be added to the feature
const hasGradeProperty = $derived(
  feature?.layerId
    ? getFeatureCardEditableProperties(appCtx, feature.layerId, true).length > 0
    : false
);
</script>

<div
  class="flex-basis-auto pointer-events-auto flex {cardCtx.isNewMode
    ? isEditing
      ? 'flex-col pl-2 w-100:pl-4'
      : 'flex-col pl-2 w-100:pl-4'
    : 'flex-row px-3 w-100:px-6'} min-h-6 flex-shrink-0 flex-grow-0 items-start justify-between overflow-visible bg-black pb-0 caret-transparent">
  {#if cardCtx.isNewMode}
    {#if isEditing}
      <div class="flex w-full items-center gap-2">
        <input
          type="text"
          class="input input-bordered w-full bg-black caret-white focus:outline-none"
          bind:value={title}
          bind:this={titleInput}
          placeholder={m.fluffy_wide_ladybug_file()}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              handleTitleSubmit();
            } else if (e.key === 'Escape') {
              handleTitleCancel();
            } else if (e.key === 'Tab') {
              handleTitleSubmit();
              // Focus pencil button after DOM update
              setTimeout(() => {
                const pencilButton = (e.target as HTMLElement)
                  ?.closest('.flex')
                  ?.querySelector('button') as HTMLButtonElement;
                pencilButton?.focus();
              }, 0);
            }
          }}
          onblur={handleTitleSubmit} />
        <button
          class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200"
          onclick={handleTitleSubmit}
          disabled={!title.trim()}>
          <Icon src={Check} class="h-5 w-5" />
        </button>
      </div>
    {:else}
      <div
        class="flex h-12 w-full items-center gap-2 pl-2 caret-transparent transition-all"
        onclick={handleEditMode}>
        <h2
          class="w-full overflow-visible text-lg text-white"
          class:text-gray-500={!title.trim()}
          class:font-bold={!title.trim()}>
          {title || m.empty_lofty_meerkat_support()}
        </h2>
        <button
          class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200">
          <Icon src={PencilSquare} class="h-5 w-5" />
        </button>
      </div>
    {/if}
  {:else}
    <h2 class="h-full w-full overflow-visible text-lg text-white">
      {getI18n(feature as Feature, 'title', userPreferences)}
    </h2>
  {/if}
  <div class="m-0 flex items-center gap-1 caret-transparent">
    {#if cardCtx.isNewMode && !hasGradeProperty}
      <!-- DO NOT SHOW -->
    {:else if cardCtx.isNewMode && hasGradeProperty}
      <div class="mt-1 flex gap-1">
        {#each Array(5) as _, i}
          <button
            class="group btn btn-ghost btn-sm p-1 focus:text-primary focus:outline-none"
            onclick={() => handleGradeSelect(i + 1)}>
            <Icon
              src={Star}
              class="h-6 w-6 group-hover:text-primary group-focus:text-primary {Number(
                grade
              ) > i
                ? 'text-primary'
                : 'text-neutral-content'}"
              theme="solid" />
          </button>
        {/each}
      </div>
    {:else if !cardCtx.isNewMode && grade}
      <Icon src={Star} class="h-6 w-6" theme="solid" />
      <span>{grade}/5</span>
    {:else}
      <span class="translate-x-[28px] rounded-full bg-black text-[8px] text-white"
        >{m.misty_quiet_sheep_push()}</span>
      <Icon src={Star} class="h-6 w-6" theme="solid" />
    {/if}
  </div>
</div>
