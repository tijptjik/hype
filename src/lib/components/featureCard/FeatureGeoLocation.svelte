<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { GlobeAlt, Check, PencilSquare } from '@steeze-ui/heroicons'
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
// ENUMS
import { NewFeatureMode } from '$lib/enums'
// TYPES
import type { Feature } from '$lib/types'

// HTML ELEMENTS
let addressInput: HTMLInputElement = $state()!

type Props = {
  feature: Feature
}
// STATE : PROPS
let { feature }: Props = $props()

// CONTEXT
const appCtx = getAppCtx()
const cardCtx = getCardCtx()

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences())

// STATE : LOCAL
let isEditingAddress = $state(false)
let currentAddress = $state('')
let originalAddress = $state('')

// Sync currentAddress with feature
$effect(() => {
  currentAddress = getI18n(feature as Feature, 'displayAddress', userPreferences, '')
})

function handleEditMode(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  originalAddress = currentAddress
  // Clear address if it's empty (placeholder will show "Click to set address")
  if (!currentAddress.trim()) {
    currentAddress = ''
  }
  isEditingAddress = true
  // focus the address input
  setTimeout(() => {
    addressInput.focus()
  }, 0)
}

// Update the feature address in the context
function handleAddressSubmit() {
  if (currentAddress.trim()) {
    isEditingAddress = false
    if (cardCtx.isNewMode) {
      appCtx.updateNewFeatureValueI18n('displayAddress', currentAddress)
    }
  }
}

function handleAddressCancel() {
  currentAddress = originalAddress
  isEditingAddress = false
}

function handleGlobeClick(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  // Close the current modal and open GeoLocation modal
  appCtx.setNewFeatureMode(NewFeatureMode.location)
}
</script>

<div
  class="pointer-events-auto flex min-h-8 flex-shrink-0 flex-grow-0 items-center justify-between overflow-visible bg-black pl-2 caret-transparent w-100:pl-4"
>
  {#if isEditingAddress}
    <div class="flex w-full items-center gap-2 pr-2">
      <input
        type="text"
        class="input input-bordered w-full bg-black caret-white focus:outline-none"
        bind:value={currentAddress}
        bind:this={addressInput}
        placeholder={m.less_quaint_clownfish_succeed()}
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            handleAddressSubmit();
          } else if (e.key === 'Escape') {
            handleAddressCancel();
          } else if (e.key === 'Tab') {
            handleAddressSubmit();
            // Focus pencil button after DOM update
            setTimeout(() => {
              const pencilButton = (e.target as HTMLElement)
                ?.closest('.flex')
                ?.parentElement?.querySelector(
                  'button:last-child'
                ) as HTMLButtonElement;
              pencilButton?.focus();
            }, 0);
          }
        }}
        onblur={handleAddressSubmit}
      >
      <button
        class="btn btn-ghost btn-sm rounded-none rounded-bl-lg p-1 hover:bg-base-300 active:scale-100 active:bg-base-200"
        onclick={handleAddressSubmit}
        disabled={!currentAddress.trim()}
      >
        <Icon src={Check} class="h-5 w-5" />
      </button>
    </div>
  {:else}
    <div
      class="flex h-12 w-full items-center pl-1.5 caret-transparent transition-all w-100:pl-2"
      onclick={handleEditMode}
    >
      <p
        class="w-full overflow-visible text-sm text-white"
        class:text-gray-500={!currentAddress.trim()}
        class:font-bold={!currentAddress.trim()}
      >
        {currentAddress || 'Click to set address'}
      </p>
      <div class="flex-grow-1 flex flex-row">
        <button
          class="btn btn-ghost btn-sm p-0.5 px-2 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200"
          onclick={handleGlobeClick}
        >
          <Icon src={GlobeAlt} class="h-6 w-6" />
        </button>
        <button
          class="btn btn-ghost btn-sm rounded-none rounded-l-lg px-3 py-1 hover:bg-base-300 focus:text-primary focus:outline-none active:scale-100 active:bg-base-200"
        >
          <Icon src={PencilSquare} class="h-5 w-5" />
        </button>
      </div>
    </div>
  {/if}
</div>
