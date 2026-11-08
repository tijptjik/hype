<script lang="ts">
// BITS
import { Icon } from '#lib/bits/index.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// ENUMS
import { NewFeatureMode } from '#lib/enums.js'
// ICONS
import Check from 'virtual:icons/proicons/checkmark'
import GlobeAlt from 'virtual:icons/proicons/globe'
import PencilSquare from 'virtual:icons/proicons/compose'

const appCtx = getSurfaceCtx()

let isEditing = $state(false)
let draftAddress = $state('')
let addressInput = $state<HTMLInputElement | null>(null)

const currentAddress = $derived(
  appCtx.draft.current?.feature?.i18n?.[getLocaleKey()]?.displayAddress?.trim() ?? '',
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

  appCtx.draft.updateI18n('displayAddress', draftAddress.trim())
  appCtx.draft.updateI18n('displayAddressGen', false)
  isEditing = false
}

function cancelEditing(): void {
  appCtx.draft.updateI18n('displayAddress', currentAddress)
  draftAddress = currentAddress
  isEditing = false
}

function reopenLocationPicker(): void {
  appCtx.draft.setMode(NewFeatureMode.location)
}
</script>

<div class="space-y-2">
  <p class="text-muted-foreground font-mono text-[11px] tracking-[0.28em] uppercase">
    Address
  </p>

  <div
    class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
  >
    {#if isEditing}
      <input
        bind:this={addressInput}
        bind:value={draftAddress}
        type="text"
        class="border-border-input bg-base-200 text-base-content caret-base-content placeholder:text-muted-foreground focus:border-border-input-hover h-11 w-full min-w-0 rounded-full border px-4 text-left text-base focus:outline-none"
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
        class="border-border-input bg-base-content/8 text-base-content hover:bg-base-content/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={saveAddress}
        disabled={!draftAddress.trim()}
      >
        <Icon src={Check} class="text-primary h-5 w-5" />
      </button>
      <button
        type="button"
        class="border-border-input bg-base-200 text-base-content hover:bg-base-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={reopenLocationPicker}
        aria-label="Open location picker"
      >
        <Icon src={GlobeAlt} class="h-5 w-5" />
      </button>
    {:else}
      <button
        type="button"
        class="border-border-input bg-base-200 hover:bg-base-300 flex h-11 w-full min-w-0 items-center rounded-full border px-4 text-left transition"
        onclick={startEditing}
      >
        <p
          class={`!block min-w-0 flex-1 overflow-hidden text-sm leading-6 text-ellipsis whitespace-nowrap ${currentAddress ? 'text-base-content' : 'text-muted-foreground font-semibold'}`}
        >
          {currentAddress || 'Click to set address'}
        </p>
      </button>
      <button
        type="button"
        class="border-border-input bg-base-200 text-base-content hover:bg-base-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={startEditing}
        aria-label="Edit address"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
      <button
        type="button"
        class="border-border-input bg-base-200 text-base-content hover:bg-base-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={reopenLocationPicker}
        aria-label="Open location picker"
      >
        <Icon src={GlobeAlt} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
