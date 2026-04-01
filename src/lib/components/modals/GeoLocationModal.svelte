<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { getLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
// CONSTANTS
import { PANEL_WIDTH } from '$lib/constants'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// COMPONENTS
import { Icon } from '$lib/bits'
import XMark from 'virtual:icons/lucide/x'
import PencilSquare from 'virtual:icons/lucide/square-pen'
import Check from 'virtual:icons/lucide/check'
// SERVICES
import { reverseGeocode } from '$lib/api/external/geocoding'
// ENUMS
import { NewFeatureMode } from '$lib/enums'
// TYPES
import type { Locale } from '$lib/types'
import type { Point } from 'geojson'

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// STATE : DERIVED
let newFeature = $derived(appCtx.getNewFeature()!)

// STATE
let displayAddress = $state<Record<Locale, string>>({
  en: newFeature?.feature?.i18n?.en?.displayAddress || '',
  'zh-hant': newFeature?.feature?.i18n?.['zh-hant']?.displayAddress || '',
  'zh-hans': newFeature?.feature?.i18n?.['zh-hans']?.displayAddress || '',
})
let isDisplayAddressGen = $state(true)
let isEditingAddress = $state(false)
let isLoading = $state(false)

let isValid = $derived(
  ((newFeature?.feature?.geometry as Point)?.coordinates &&
    newFeature?.feature?.i18n?.en?.displayAddress?.length &&
    newFeature.feature.i18n.en.displayAddress.length > 0) ||
    (newFeature?.feature?.i18n &&
      Object.values(newFeature.feature.i18n).some(
        t => t?.displayAddress?.length && t?.displayAddress?.length > 0,
      )),
)

// PANEL STATE
let horizontalOffset = $derived(appCtx.getHorizontalOffset())

function reset() {
  isEditingAddress = false
  displayAddress = {
    en: '',
    'zh-hant': '',
    'zh-hans': '',
  }
  isDisplayAddressGen = true
}

function handleCloseModal() {
  reset()
  appCtx.setNewFeatureMode(null)
  omniCtx.cancelNewFeature()
}

function handleAccept() {
  appCtx.setNewFeatureMode(NewFeatureMode.card)
}

async function handleSetLocation() {
  const center = appCtx.map?.getCenter()
  if (center) {
    appCtx.updateNewFeatureValue('geometry', {
      type: 'Point',
      coordinates: [center.lng, center.lat],
    })
  }
  if (!(newFeature?.feature?.geometry as Point)?.coordinates) return

  isLoading = true
  try {
    const [lng, lat] = (newFeature?.feature?.geometry as Point)?.coordinates
    const result = await reverseGeocode(lng, lat)

    if (result) {
      displayAddress = {
        en: result.i18n?.en?.displayAddress || '',
        'zh-hant': result.i18n?.['zh-hant']?.displayAddress || '',
        'zh-hans': result.i18n?.['zh-hans']?.displayAddress || '',
      }
      handleAddressSave()
      isValid = true
    }
  } finally {
    isLoading = false
  }
}

function handleAddressEdit() {
  isEditingAddress = true
}

function handleAddressSave() {
  if (!newFeature) return
  isDisplayAddressGen = false

  const locale = getLocale()
  appCtx.updateNewFeatureValueI18n('displayAddress', displayAddress[locale])
  appCtx.updateNewFeatureValueI18n('displayAddressGen', isDisplayAddressGen)

  isEditingAddress = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (isEditingAddress) {
      isEditingAddress = false
    } else {
      handleCloseModal()
    }
  } else if (e.key === '/') {
    e.preventDefault()
    // If editing, focus the address input; if not, enter edit mode and focus
    if (!isEditingAddress && isValid) {
      isEditingAddress = true
      setTimeout(() => {
        const input = document.querySelector(
          '.modal-box input[type="text"]',
        ) as HTMLInputElement | null
        if (input) {
          input.focus()
          input.select()
        }
      }, 0)
    } else if (isEditingAddress) {
      const input = document.querySelector(
        '.modal-box input[type="text"]',
      ) as HTMLInputElement | null
      if (input) {
        input.focus()
        input.select()
      }
    }
  }
}
</script>

{#if appCtx.newFeatureMode === NewFeatureMode.location}
  <dialog
    class="modal pointer-events-none z-10 bg-transparent"
    style="background: none;"
    class:modal-open={appCtx.newFeatureMode === NewFeatureMode.location}
    onkeydown={handleKeydown}
  >
    <div
      class="modal-box m-0 flex h-full w-full flex-col items-center justify-center bg-transparent p-0 {horizontalOffset ==
      -(PANEL_WIDTH / 2)
        ? '-translate-x-[210px]'
        : horizontalOffset == PANEL_WIDTH / 2
          ? 'translate-x-[210px]'
          : 'translate-x-0'}"
    >
      <div
        class="group pointer-events-auto relative my-4 flex translate-x-4 cursor-pointer items-center justify-between caret-transparent"
        onclick={handleCloseModal}
      >
        <h3
          id="modal-title"
          class="text-shadow-lg/30 pointer-events-none w-full rounded-xl bg-black/80 px-3 py-1 text-center text-xl font-bold uppercase tracking-wide group-hover:rounded-r-none group-focus:border-none group-focus:outline-none"
          tabindex="-1"
        >
          {m.lazy_round_falcon_shine()}
        </h3>
        <button
          class="group-hover:font-bolder btn btn-ghost btn-sm pointer-events-none mt-0.5 h-9 w-8 -translate-y-px rounded-l-none p-0 py-1.75 transition-all duration-300 focus:outline-none group-hover:bg-black/80 group-hover:text-white"
        >
          <Icon src={XMark} class="h-5 w-5" />
        </button>
      </div>

      <!-- Location Indicator -->
      <div class="relative mx-4 aspect-square max-h-100 min-h-50 min-w-62.5 max-w-62.5">
        <div class="absolute inset-0 rounded-full border-4 border-[#4987E2]"></div>
        <div
          class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        ></div>
      </div>

      <!-- Address Section -->
      <div class="pointer-events-auto mt-4 text-center">
        {#if isValid}
          {#if isEditingAddress}
            <div
              class="relative flex items-center justify-center gap-2 caret-transparent"
            >
              <input
                type="text"
                class="input input-bordered flex-1 bg-black pr-10 caret-white focus:outline-none"
                onkeydown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    handleAddressSave();
                  }
                }}
                bind:value={displayAddress[getLocale()]}
                placeholder={m.less_quaint_clownfish_succeed()}
              >
              <button
                class="btn btn-square btn-ghost absolute right-0 focus:text-primary focus:outline-none"
                onclick={handleAddressSave}
              >
                <Icon src={Check} class="h-5 w-5" />
              </button>
            </div>
          {:else}
            <div class="relative flex h-12 items-center justify-center gap-2">
              <p class="max-w-70 flex-1 bg-black px-2 py-1 text-left">
                {displayAddress[getLocale()] || 'No address found'}
              </p>
              <button
                class="btn btn-square btn-ghost absolute -right-10 focus:text-primary focus:outline-none"
                onclick={handleAddressEdit}
              >
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
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="loading loading-ring loading-sm"></span>
              {m.full_calm_monkey_engage()}
            {:else}
              {m.cool_ago_jackdaw_pop()}
            {/if}
          </button>
        {:else}
          <button
            class="btn bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300"
            onclick={handleSetLocation}
            disabled={isLoading}
          >
            {m.new_feature__reset_address()}
          </button>
          <button
            class="btn bg-base-400 uppercase hover:bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary active:bg-base-300"
            onclick={handleAccept}
            disabled={!isValid}
          >
            {m.close_shy_jurgen_cook()}
          </button>
        {/if}
      </div>
    </div>
  </dialog>
{/if}
