<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// I18N
import { getLocale, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import { NewFeatureMode } from '$lib/enums'
// ICONS
import Check from 'virtual:icons/lucide/check'
import GlobeAlt from 'virtual:icons/lucide/globe'
import PencilSquare from 'virtual:icons/lucide/square-pen'

const appCtx = getAppCtx()

let isEditing = $state(false)
let draftAddress = $state('')
let addressInput = $state<HTMLInputElement | null>(null)

const currentAddress = $derived(
  appCtx.getNewFeature()?.feature?.i18n?.[getLocale()]?.displayAddress?.trim() ?? '',
)

$effect(() => {
  if (!isEditing) {
    draftAddress = currentAddress
  }
})

function startEditing(): void {
  draftAddress = currentAddress
  isEditing = true
  setTimeout(() => addressInput?.focus(), 0)
}

function saveAddress(): void {
  if (!draftAddress.trim()) return

  appCtx.updateNewFeatureValueI18n('displayAddress', draftAddress.trim())
  appCtx.updateNewFeatureValueI18n('displayAddressGen', false)
  isEditing = false
}

function cancelEditing(): void {
  appCtx.updateNewFeatureValueI18n('displayAddress', currentAddress)
  draftAddress = currentAddress
  isEditing = false
}

function reopenLocationPicker(): void {
  appCtx.setNewFeatureMode(NewFeatureMode.location)
}
</script>

<div class="space-y-2">
  <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-white/48">Address</p>

  <div
    class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
  >
    {#if isEditing}
      <input
        bind:this={addressInput}
        bind:value={draftAddress}
        type="text"
        class="h-11 min-w-0 w-full rounded-full border border-white/14 bg-black/35 px-4 text-left text-base text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
        placeholder={m.less_quaint_clownfish_succeed()}
        onkeydown={event => {
          event.stopPropagation()
          if (event.key === 'Enter') saveAddress()
          if (event.key === 'Escape') cancelEditing()
        }}
        onblur={saveAddress}
      >
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
        onclick={saveAddress}
        disabled={!draftAddress.trim()}
      >
        <Icon src={Check} class="h-5 w-5 text-primary" />
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={reopenLocationPicker}
        aria-label="Open location picker"
      >
        <Icon src={GlobeAlt} class="h-5 w-5" />
      </button>
    {:else}
      <button
        type="button"
        class="flex h-11 min-w-0 w-full items-center rounded-full border border-white/10 bg-black/25 px-4 text-left transition hover:bg-black/35"
        onclick={startEditing}
      >
        <p
          class={`truncate text-sm leading-6 ${currentAddress ? 'text-white' : 'font-semibold text-white/45'}`}
        >
          {currentAddress || 'Click to set address'}
        </p>
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={startEditing}
        aria-label="Edit address"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={reopenLocationPicker}
        aria-label="Open location picker"
      >
        <Icon src={GlobeAlt} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
