<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Check, PencilSquare } from '@steeze-ui/heroicons';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Feature, UserContributedFeature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// CONTEXT
const cardCtx = getFeatureCardContext();
const appCtx = getAppCtx();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// STATE : LOCAL
let isEditing = $state(false);
let description = $derived(
  getI18n(feature, 'description', userPreferences, m.zany_merry_seahorse_treasure())
);
let originalDescription = $state('');
let textAreaEl: HTMLTextAreaElement = $state()!;

// ═══════════════════════
// 1 HANDLERS :: EDIT MODE
// ═══════════════════════

function handleEditMode(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  originalDescription = description;
  // Clear description if it's the placeholder value
  if (description === m.zany_merry_seahorse_treasure()) {
    description = '';
  }
  isEditing = true;
  // Focus the description textarea
  setTimeout(() => {
    textAreaEl.focus();
  }, 0);
}

function handleDescriptionSubmit() {
  isEditing = false;
  // Update the feature description in the context
  appCtx.updateNewFeatureValueI18n('description', description);
}

function handleDescriptionCancel() {
  description = originalDescription;
  isEditing = false;
}
</script>

<div
  class="flex-shrink-0 relative z-10 my-0 flex min-h-12 flex-col bg-black caret-transparent">
  <div class="overflow-y-auto">
    <div class="mb-2 bg-black py-0 pl-2">
      {#if isEditing}
        <div class="flex flex-row items-center gap-2 w-100:pl-2">
          <div
            class="
                text-md
                grid
                w-full
                after:invisible
                after:whitespace-pre-wrap
                after:border
                after:px-3.5
                after:py-3
                after:text-inherit
                after:content-[attr(data-cloned-val)_'_']
                after:[grid-area:1/1/2/2]
                [&>textarea]:resize-y
                [&>textarea]:overflow-hidden
                [&>textarea]:text-inherit
                [&>textarea]:[grid-area:1/1/2/2]
            ">
            <textarea
              class="text-md textarea input-bordered w-full resize-y rounded-lg bg-black px-3.5 py-2.5 caret-white outline-none"
              bind:this={textAreaEl}
              bind:value={description}
              onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  handleDescriptionSubmit();
                } else if (e.key === 'Escape') {
                  handleDescriptionCancel();
                } else if (e.key === 'Tab') {
                  handleDescriptionSubmit();
                  // Focus pencil button after DOM update
                  setTimeout(() => {
                    const pencilButton = (e.target as HTMLElement)
                      ?.closest('.flex')
                      ?.querySelector('button') as HTMLButtonElement;
                    pencilButton?.focus();
                  }, 0);
                }
              }}
              onfocus={(e) => {
                const parent = e.currentTarget.parentElement as HTMLElement;
                if (parent) {
                  parent.dataset.clonedVal = e.currentTarget.value;
                }
              }}
              oninput={(e) => {
                // Update the cloned value for auto-growth
                const parent = e.currentTarget.parentElement as HTMLElement;
                if (parent) {
                  parent.dataset.clonedVal = e.currentTarget.value;
                }
              }}
              onblur={handleDescriptionSubmit}
              placeholder="Enter description..."
              rows="1"></textarea>
          </div>
          <button
            class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
            onclick={handleDescriptionSubmit}
            disabled={!description.trim()}>
            <Icon src={Check} class="h-5 w-5" />
          </button>
        </div>
      {:else}
        <div
          class="pointer-events-auto mb-2 flex items-center justify-between pt-2"
          onclick={handleEditMode}>
          <p
            class="pl-2 text-sm font-thin tracking-tight text-gray-300 w-100:pl-4"
            class:text-gray-500={!description.trim()}
            class:font-bold={!description.trim()}>
            {description}
          </p>
          <button
            class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200">
            <Icon src={PencilSquare} class="h-5 w-5" />
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
