<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// I18N
import { getLocale, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ICONS
import Check from 'virtual:icons/lucide/check'
import PencilSquare from 'virtual:icons/lucide/square-pen'

const appCtx = getAppCtx()

let isEditing = $state(false)
let draftDescription = $state('')
let descriptionInput = $state<HTMLTextAreaElement | null>(null)

const currentDescription = $derived(
  appCtx.getNewFeature()?.feature?.i18n?.[getLocale()]?.description?.trim() ?? '',
)

$effect(() => {
  if (!isEditing) {
    draftDescription = currentDescription
  }
})

function startEditing(): void {
  draftDescription = currentDescription
  isEditing = true
  setTimeout(() => descriptionInput?.focus(), 0)
}

function saveDescription(): void {
  if (!draftDescription.trim()) return

  appCtx.updateNewFeatureValueI18n('description', draftDescription.trim())
  isEditing = false
}

function cancelEditing(): void {
  appCtx.updateNewFeatureValueI18n('description', currentDescription)
  draftDescription = currentDescription
  isEditing = false
}
</script>

<div class="space-y-2">
  <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-white/48">
    Description
  </p>

  <div class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
    {#if isEditing}
      <textarea
        bind:this={descriptionInput}
        bind:value={draftDescription}
        class="min-h-28 min-w-0 w-full rounded-[1.5rem] border border-white/14 bg-black/35 px-4 py-3 text-left text-sm leading-6 text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
        placeholder={m.zany_merry_seahorse_treasure()}
        onkeydown={event => {
          event.stopPropagation()
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            saveDescription()
          }
          if (event.key === 'Escape') cancelEditing()
        }}
        onblur={saveDescription}
      ></textarea>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
        onclick={saveDescription}
        disabled={!draftDescription.trim()}
      >
        <Icon src={Check} class="h-5 w-5 text-primary" />
      </button>
    {:else}
      <button
        type="button"
        class="flex min-h-28 min-w-0 w-full items-start rounded-[1.5rem] border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:bg-black/35"
        onclick={startEditing}
      >
        <p
          class={`text-sm leading-6 ${currentDescription ? 'text-white/82' : 'font-semibold text-white/45'}`}
        >
          {currentDescription || m.zany_merry_seahorse_treasure()}
        </p>
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={startEditing}
        aria-label="Edit description"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
