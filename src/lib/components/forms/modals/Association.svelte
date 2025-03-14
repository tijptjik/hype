<script lang="ts">
// SVELTE
import { createEventDispatcher } from 'svelte';
import { page } from '$app/stores';
// NAVIGATION
import { goto } from '$app/navigation';
// LIB
import { NEW_REF, ADMIN_PATH } from '$lib';
// I18N
import { i18n } from '$lib/i18n';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Check } from '@steeze-ui/heroicons';
import { navItems } from '$lib/navigation';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
// TYPES
import type { ResourceType, ApiEntity, HierarchicalResource } from '$lib/types';

// TYPES
type Props = {
  parentResourceType: HierarchicalResource;
  childResourceType: ResourceType;
};

// CONTEXT
const resourceState = getHierarchicalResourceState();

// STATE
let selectedItem = $state<any>(null);
let isOpen = $state(false);
let selectedIndex = $state(-1);

// PROPS
let { parentResourceType, childResourceType }: Props = $props();

// EVENTS
const dispatch = createEventDispatcher();

// UTILITIES
const close = () => {
  isOpen = false;
  selectedItem = null;
};

const handleSelect = (item: any) => {
  selectedItem = item;
};

const getParentRefKey = (parentResourceType: HierarchicalResource) => {
  return {
    organisation: 'code',
    project: 'code',
    layer: 'code',
    feature: 'id',
    task: 'id'
  }[parentResourceType];
};

const handleConfirm = () => {
  // TODO Confirm this is working
  if (!selectedItem) return;

  // routerState.updateWith({
  //   resource: routerState.resource,
  //   entity: NEW_REF,
  //   facet: 'core'
  // });

  const url = new URL(window.location.href);
  url.pathname = `${ADMIN_PATH}/${childResourceType}s/new`;
  // appMeta.context.parentRef = selectedItem.ref;
  close();
  goto(i18n.resolveRoute(url.toString()));
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
  // TODO Confirm this is working
  // resourceState.refreshResources(parentResourceType);
  selectedIndex = -1;
  isOpen = true;
};

// Make the open method available to parent components
$effect(() => {
  dispatch('ready', { open });
});

/**
 * Retrieves the current URL query parameters.
 *
 * This function creates and returns a new URLSearchParams object
 * based on the current page's URL search parameters. It allows
 * easy access and manipulation of query parameters.
 *
 * @returns {URLSearchParams} A new URLSearchParams object containing the current query parameters
 */
// export const getQueryParams = (): URLSearchParams => {
//   return new URLSearchParams($page.url.searchParams.toString());
// };

// FUNCTIONS : FETCH

/**
 * Fetches resources for a given resource type
 *
 * This function fetches resources for a specified resource type from the API.
 * It constructs the URL with the current query parameters and fetches the data.
 * The fetched data is then stored in the resources store.
 *
 * @param {ResourceType} resourceType - The type of resource to fetch
 */
// export const fetchResources = async (resourceType: ResourceType) => {
//   if (resourceType) {
//     try {
//       const queryParams = getQueryParams();
//       const response = await fetch(
//         `/api/${navItems[resourceType as keyof typeof navItems].path}${queryParams ? `?${queryParams}` : ''}`
//       );
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
//       const result: ApiEntity[] = await response.json();
//       resourceState.state.resources[resourceType] = result.map(toEntity);
//     } catch (error) {
//       console.error(`Error fetching ${resourceType}:`, error);
//     }
//   }
// };

/**
 * Converts an API entity to a standardized entity format.
 *
 * This function takes an ApiEntity object and transforms it into a standardized
 * entity format with consistent property names and fallback values.
 *
 * @param {ApiEntity} apiEntity - The API entity to be converted
 * @returns {Object} A standardized entity object with the following properties:
 *   - id: The unique identifier of the entity
 *   - name: The full name of the entity (fallback to title or empty string)
 *   - nameShort: A short name or title for the entity (fallback to name or empty string)
 *   - description: A description of the entity (fallback to empty string)
 *   - ref: A reference code for the entity (fallback to id)
 *   - data: The original API entity object
 */
// export const toEntity = (apiEntity: ApiEntity) => {
//   return {
//     id: apiEntity.id,
//     name: apiEntity.name || apiEntity.properties?.title || '',
//     nameShort:
//       apiEntity.properties?.title || apiEntity.nameShort || apiEntity.name || '',
//     description: apiEntity.description || apiEntity.properties?.description || '',
//     ref: apiEntity.ref || apiEntity.code || apiEntity.id,
//     data: apiEntity
//   };
// };
</script>

<svelte:window on:keydown={handleKeydown} />

<dialog class="modal" class:modal-open={isOpen}>
  <div class="modal-box">
    <h3 class="mb-4 text-lg font-bold">Select {parentResourceType}</h3>

    <div class="mb-4">
      <FilterInput resourceType={parentResourceType} rounded={true} clearInput={true} />
    </div>

    <div class="mb-4 max-h-60 overflow-y-auto">
      {#if resourceState.state.resources[parentResourceType]?.length > 0}
        <ul class="menu space-y-1 rounded-lg bg-base-100">
          {#each resourceState.state.resources[parentResourceType].slice(0, 7) as item, i}
            <li class="bg-base-200 first:rounded-t-lg last:rounded-b-lg">
              <button
                class="flex items-center justify-between py-2 hover:bg-base-300"
                onclick={() => {
                  selectedIndex = i;
                  handleSelect(item);
                }}>
                <span>{item.name || item.title}</span>
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
