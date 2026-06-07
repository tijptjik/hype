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
let draftTitle = $state('')
let titleInput = $state<HTMLInputElement | null>(null)
let originalTitle = $state('')

const currentTitle = $derived(
  appCtx.getNewFeature()?.feature?.i18n?.[getLocale()]?.title?.trim() ?? '',
)

$effect(() => {
  if (!isEditing) {
    draftTitle = currentTitle
  }
})

function startEditing(): void {
  originalTitle = currentTitle
  draftTitle = currentTitle
  isEditing = true
  setTimeout(() => titleInput?.focus(), 0)
}

function saveTitle(): void {
  if (!draftTitle.trim()) {
    appCtx.updateNewFeatureValueI18n('title', originalTitle)
    draftTitle = originalTitle
    isEditing = false
    return
  }

  appCtx.updateNewFeatureValueI18n('title', draftTitle.trim())
  isEditing = false
}

function cancelEditing(): void {
  appCtx.updateNewFeatureValueI18n('title', originalTitle)
  draftTitle = originalTitle
  isEditing = false
}
</script>

<div class="space-y-2">
  <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-white/48">Title</p>

  <div class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    {#if isEditing}
      <input
        bind:this={titleInput}
        bind:value={draftTitle}
        type="text"
        class="h-11 min-w-0 w-full rounded-full border border-white/14 bg-black/35 px-4 text-left text-base font-semibold text-white caret-white placeholder:text-white/34 focus:border-white/28 focus:outline-none"
        placeholder={m.fluffy_wide_ladybug_file()}
        oninput={() => {
          appCtx.updateNewFeatureValueI18n('title', draftTitle)
        }}
        onkeydown={event => {
          event.stopPropagation()
          if (event.key === 'Enter') saveTitle()
          if (event.key === 'Escape') cancelEditing()
        }}
        onblur={saveTitle}
      >
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/16"
        onclick={saveTitle}
        disabled={!draftTitle.trim()}
      >
        <Icon src={Check} class="h-5 w-5 text-primary" />
      </button>
    {:else}
      <button
        type="button"
        class="flex h-11 min-w-0 w-full items-center rounded-full border border-white/10 bg-black/25 px-4 text-left transition hover:bg-black/35"
        onclick={startEditing}
      >
        <p
          class={`truncate text-base font-semibold ${currentTitle ? 'text-white' : 'text-white/45'}`}
        >
          {currentTitle || m.empty_lofty_meerkat_support()}
        </p>
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white transition hover:bg-black/45"
        onclick={startEditing}
        aria-label="Edit title"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
