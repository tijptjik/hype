<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// API
import { updateUserProfile } from '$lib/api/server/user.remote'
// BITS
import { Icon } from '$lib/bits'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getCardCtx } from '$lib/context/card.svelte'
// ICONS
import Check from 'virtual:icons/lucide/check'
import PencilSquare from 'virtual:icons/lucide/square-pen'

const appCtx = getAppCtx()
const cardCtx = getCardCtx()

let editedAttribution = $state(appCtx.getUser()?.attribution || '')
let originalAttribution = $state(appCtx.getUser()?.attribution || '')
let editing = $state(!(appCtx.getUser()?.attribution || '').trim())
let isSaveSuccess = $state(false)

async function saveAttribution(): Promise<void> {
  if (cardCtx.getError() === m.validation__attribution_required()) {
    cardCtx.resetError()
  }

  if (!appCtx.user?.id) {
    console.warn('User session not found. Cannot update attribution.')
    return
  }

  try {
    const response = await updateUserProfile({
      id: appCtx.user.id,
      data: { attribution: editedAttribution },
    })

    if (response?.data && appCtx.user) {
      appCtx.user.attribution = editedAttribution
      cardCtx.setAttribution(editedAttribution)
      originalAttribution = editedAttribution
      isSaveSuccess = true
      setTimeout(() => {
        isSaveSuccess = false
      }, 2000)
    }
  } catch (error) {
    console.error('Error updating attribution:', error)
  }

  editing = false
}

function cancelEdit(): void {
  editedAttribution = originalAttribution
  editing = false
}

function startEdit(): void {
  originalAttribution = editedAttribution
  editing = true
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    void saveAttribution()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement
  const input = document.getElementById('feature-card-attribution-input')
  const editButton = document.getElementById('feature-card-attribution-edit-button')
  const saveButton = document.getElementById('feature-card-attribution-save-button')

  if (
    input &&
    !input.contains(target) &&
    (!editButton || !editButton.contains(target)) &&
    (!saveButton || !saveButton.contains(target))
  ) {
    cancelEdit()
  }
}

function clickOutside(node: HTMLElement, handler: (event: MouseEvent) => void) {
  const handleClick = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) {
      handler(event)
    }
  }

  document.addEventListener('click', handleClick, true)

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true)
    },
  }
}

$effect(() => {
  const currentAttr = appCtx.user?.attribution || ''
  editedAttribution = currentAttr
  originalAttribution = currentAttr
  editing = !currentAttr.trim()
})
</script>

<div class="flex w-full flex-col gap-3 text-white">
  <div class="space-y-1 text-center">
    <p class="font-mono pt-2 text-[11px] uppercase tracking-[0.28em] text-white/48">
      {m.photo_credit_credited_as()}
    </p>
  </div>

  <div class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    {#if !editedAttribution.trim() || editing}
      <input
        id="feature-card-attribution-input"
        type="text"
        class="h-11 min-w-0 w-full rounded-full border border-white/14 bg-black/35 px-4 text-center text-base font-semibold text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
        placeholder={m.photo_credit_input_placeholder()}
        bind:value={editedAttribution}
        onkeydown={handleKeydown}
        use:clickOutside={handleClickOutside}
      >
    {:else}
      <p
        class="flex h-11 min-w-0 w-full items-center justify-center rounded-full border border-white/10 bg-black/25 px-4 text-center text-base font-semibold text-white"
      >
        {editedAttribution}
      </p>
    {/if}

    {#if editing || !editedAttribution.trim()}
      <button
        type="button"
        id="feature-card-attribution-save-button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
        onclick={() => {
          void saveAttribution()
        }}
      >
        <Icon
          src={Check}
          class={`h-5 w-5 transition-colors ${isSaveSuccess ? 'text-success' : 'text-primary'}`}
        />
      </button>
    {:else}
      <button
        type="button"
        id="feature-card-attribution-edit-button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={startEdit}
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
