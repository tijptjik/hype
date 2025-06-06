<script lang="ts">
// SVELTE
import { page } from '$app/state';
import { NEW_REF } from '$lib';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// I18N
import { getLocale, getI18n } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Check } from '@steeze-ui/heroicons';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
// ENUMS
import {
  HierarchicalResource,
  HierarchicalResourceParent,
  HierarchicalResourceRefKey
} from '$lib/enums';
// TYPES
import type { Resource, ResourceTypeWithChildren } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// PROPS
let {
  isOpen = $bindable()
}: {
  isOpen: boolean;
} = $props();

// RESOURCES
const parentResourceType = HierarchicalResourceParent[
  resourceState.activeResource as keyof typeof HierarchicalResourceParent
] as ResourceTypeWithChildren;

// STATE
let selectedItem: Resource | null = $state(null);
let selectedIndex: number = $state(-1);

// UTILITIES
const close = () => {
  isOpen = false;
  selectedItem = null;
};

const handleSelect = (item: Resource) => {
  selectedItem = item;
};

const handleConfirm = () => {
  // VERIFY: This works
  if (!selectedItem) return;
  navigateOnAdmin(
    resourceState,
    resourceState.activeResource as HierarchicalResource,
    NEW_REF,
    undefined,
    {
      parentId: selectedItem.id,
      parentRef: selectedItem[HierarchicalResourceRefKey[parentResourceType]]
    }
  );
  close();
};

const handleKeydown = (event: KeyboardEvent) => {
  if (!resourceState.state.resources[parentResourceType]?.length) return;

  const items = resourceState.state.resources[parentResourceType];
  const maxIndex = Math.min(items.length - 1, 6); // Limit to 7 items (0-6)

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex = selectedIndex < maxIndex ? selectedIndex + 1 : 0;
      handleSelect(items[selectedIndex]);
      break;

    case 'ArrowUp':
      event.preventDefault();
      selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : maxIndex;
      handleSelect(items[selectedIndex]);
      break;

    case 'Tab':
      event.preventDefault();
      if (event.shiftKey) {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : maxIndex;
      } else {
        selectedIndex = selectedIndex < maxIndex ? selectedIndex + 1 : 0;
      }
      handleSelect(items[selectedIndex]);
      break;

    case 'Enter':
      event.preventDefault();
      if (selectedItem) {
        handleConfirm();
      }
      break;
  }
};

// Reset selectedIndex when modal opens
const open = () => {
  selectedIndex = -1;
  isOpen = true;
};
</script>

<svelte:window on:keydown={handleKeydown} />

<dialog class="modal" class:modal-open={isOpen}>
  <div class="modal-box">
    <h3 class="mb-4 text-lg font-bold">Select {parentResourceType}</h3>
    <div class="mb-4">
      <FilterInput resourceType={parentResourceType} rounded={true} clearInput={true} />
    </div>

    <div class="mb-4 max-h-60 overflow-y-auto">
      {#if resourceState.getFilteredResource(parentResourceType as HierarchicalResource)?.length > 0}
        <ul class="menu space-y-1 rounded-lg bg-base-100">
          {#each resourceState
            .getFilteredResource(parentResourceType as HierarchicalResource)
            .slice(0, 7) as item, i}
            <li class="bg-base-200 first:rounded-t-lg last:rounded-b-lg">
              <button
                class="flex items-center justify-between py-2 hover:bg-base-300"
                onclick={() => {
                  selectedIndex = i;
                  handleSelect(item);
                }}>
                <span
                  >{item.i18n[getLocale()].name || item.i18n[getLocale()].title}</span>
                {#if selectedItem?.id === item.id}
                  <Icon src={Check} class="h-5 w-5" />
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-center text-gray-500">No results found</p>
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost" onclick={close}>Cancel</button>
      <button class="btn btn-primary" onclick={handleConfirm} disabled={!selectedItem}>
        Continue
      </button>
    </div>
  </div>
  <div class="modal-backdrop" onclick={close}></div>
</dialog>
