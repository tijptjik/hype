<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// I18N
import { m } from '$lib/i18n';
// CONSTANTS
import { MOBILE_MAX_WIDTH } from '$lib/index';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  XMark,
  PencilSquare,
  Check,
  UserGroup,
  Squares2x2,
  Square3Stack3d,
  ChevronDown
} from '@steeze-ui/heroicons';
// SERVICES
import { reverseGeocode } from '$lib/services/geocoding';
// TYPES
import type { UserContributedFeature } from '$lib/types';

// CONTEXT
const mapCtx = getMapContext();
const omniCtx = getOmniContext();

// STATE
let isOpen = $state(false);
let displayAddress = $state('');
let isEditingAddress = $state(false);
let isLoading = $state(false);

let newFeature: UserContributedFeature | null = $derived(mapCtx.getNewFeature());

let isValid = $derived(
  newFeature?.geometry?.coordinates &&
    (newFeature?.displayAddress?.length > 0 ||
      (newFeature?.translations &&
        Object.values(newFeature.translations).some(
          (t) => t.displayAddress?.length > 0
        )))
);

// PANEL STATE
let horizontalOffset = $derived.by(() => {
  const { filters, maps, stars, settings } = mapCtx.state.panels;
  const leftPanelOpen = maps || stars;
  const rightPanelOpen = filters || settings;
  if (window.innerWidth < MOBILE_MAX_WIDTH) {
    return 0;
  }
  return leftPanelOpen && rightPanelOpen
    ? 0
    : leftPanelOpen
      ? 420 / 2
      : rightPanelOpen
        ? -420 / 2
        : 0;
});

const handleShowModal = () => {
  isOpen = true;
  // Get the center of the map
};

function handleCloseModal() {
  isEditingAddress = false;
  displayAddress = '';
  mapCtx.setNewFeature({
    ...newFeature,
    geometry: undefined,
    displayAddress: undefined,
    translations: {
      ...(newFeature?.translations || {}),
      'zh-hant': {
        ...(newFeature?.translations?.['zh-hant'] || {}),
        displayAddress: undefined
      },
      'zh-hans': {
        ...(newFeature?.translations?.['zh-hans'] || {}),
        displayAddress: undefined
      }
    }
  });
  isOpen = false;
  omniCtx.setMode('search');
  omniCtx.focusSearchBar();
}

async function handleSetLocation() {
  const center = mapCtx.map?.getCenter();
  if (center) {
    mapCtx.setNewFeature({
      ...newFeature,
      geometry: {
        type: 'Point',
        coordinates: [center.lng, center.lat]
      }
    });
  }
  if (!newFeature?.geometry?.coordinates!) return;

  isLoading = true;
  try {
    const [lng, lat] = newFeature.geometry.coordinates;
    const result = await reverseGeocode(lng, lat);

    if (result) {
      displayAddress = result.displayAddress || '';
      isValid = true;
    }
  } finally {
    isLoading = false;
  }
}

function handleAddressEdit() {
  isEditingAddress = true;
}

function handleAddressSave() {
  if (!newFeature) return;

  const locale = document.documentElement.lang;
  if (locale === 'en') {
    mapCtx.setNewFeature({
      ...newFeature,
      displayAddress
    });
  } else {
    mapCtx.setNewFeature({
      ...newFeature,
      translations: {
        ...newFeature.translations,
        [locale]: {
          ...newFeature.translations?.[locale],
          displayAddress
        }
      }
    });
  }

  isEditingAddress = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (isEditingAddress) {
      isEditingAddress = false;
    } else {
      handleCloseModal();
    }
  } else if (e.key === '/') {
    e.preventDefault();
    // If editing, focus the address input; if not, enter edit mode and focus
    if (!isEditingAddress && isValid) {
      isEditingAddress = true;
      setTimeout(() => {
        const input = document.querySelector(
          '.modal-box input[type="text"]'
        ) as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      }, 0);
    } else if (isEditingAddress) {
      const input = document.querySelector(
        '.modal-box input[type="text"]'
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }
}

// EVENT HANDLERS
onMount(() => {
  window.addEventListener('showGeoLocationModal', handleShowModal);
  window.addEventListener('closeGeoLocationModal', handleCloseModal);
  return () => {
    window.removeEventListener('showGeoLocationModal', handleShowModal);
    window.removeEventListener('closeGeoLocationModal', handleCloseModal);
  };
});
</script>

{#if isOpen}
  <dialog
    class="modal pointer-events-none z-10 bg-transparent"
    style="background: none;"
    class:modal-open={isOpen}
    onkeydown={handleKeydown}>
    <div
      class="modal-box m-0 flex h-full w-full flex-col items-center justify-center bg-transparent p-0"
      style="transform: translateX(${horizontalOffset}px)">
      <div
        class="group pointer-events-auto relative my-4 flex cursor-pointer items-center justify-between caret-transparent"
        onclick={handleCloseModal}>
        <h3
          id="modal-title"
          class="text-shadow-lg/30 w-full rounded-xl bg-black/80 px-3 py-1 text-center text-xl font-bold uppercase tracking-wide group-hover:rounded-r-none group-focus:border-none group-focus:outline-none"
          tabindex="-1">
          {m.lazy_round_falcon_shine()}
        </h3>
        <button
          class="group-hover:font-bolder btn btn-ghost btn-sm absolute right-0 mt-[2px] h-9 w-8 -translate-y-[1px] translate-x-[32px] rounded-l-none p-0 py-[7px] transition-all duration-300 focus:outline-none group-hover:bg-black/80 group-hover:text-white">
          <Icon src={XMark} class="h-5 w-5" />
        </button>
      </div>

      <!-- Location Indicator -->
      <div
        class="relative mx-4 aspect-square max-h-[400px] min-h-[200px] min-w-[250px] max-w-[250px]">
        <div class="absolute inset-0 rounded-full border-4 border-[#4987E2]"></div>
        <div
          class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white">
        </div>
      </div>

      <!-- Address Section -->
      <div class="pointer-events-auto mt-4 text-center">
        {#if isValid}
          {#if isEditingAddress}
            <div
              class="relative flex items-center justify-center gap-2 caret-transparent">
              <input
                type="text"
                class="input input-bordered flex-1 bg-black pr-10 caret-white focus:outline-none"
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    handleAddressSave();
                  }
                }}
                bind:value={displayAddress}
                placeholder="Enter address" />
              <button
                class="btn btn-square btn-ghost absolute right-0 focus:text-primary focus:outline-none"
                onclick={handleAddressSave}>
                <Icon src={Check} class="h-5 w-5" />
              </button>
            </div>
          {:else}
            <div class="relative flex h-12 items-center justify-center gap-2">
              <p class="max-w-[280px] flex-1 bg-black px-2 py-1 text-left">
                {displayAddress || 'No address found'}
              </p>
              <button
                class="btn btn-square btn-ghost absolute -right-10 focus:text-primary focus:outline-none"
                onclick={handleAddressEdit}>
                <Icon src={PencilSquare} class="h-5 w-5" />
              </button>
            </div>
          {/if}
        {:else}
          <div class="flex items-center justify-center gap-2">
            <p class="h-12 flex-1 text-left text-base-content/60"></p>
            <div class="w-10"></div>
          </div>
        {/if}
      </div>

      <div class="modal-action pointer-events-auto mt-4 caret-transparent">
        {#if !isValid}
          <button
            class="btn bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300"
            onclick={handleSetLocation}
            disabled={isLoading}>
            {#if isLoading}
              <span class="loading loading-spinner loading-sm"></span>
              {m.full_calm_monkey_engage()}
            {:else}
              {m.cool_ago_jackdaw_pop()}
            {/if}
          </button>
        {:else}
          <button
            class="btn bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300"
            onclick={handleCloseModal}
            disabled={!isValid}>
            {m.close_shy_jurgen_cook()}
          </button>
        {/if}
      </div>
    </div>
  </dialog>
{/if}
