<script lang="ts">
// BITS
import { Icon } from '#lib/bits/index.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// ICONS
import Check from 'virtual:icons/proicons/checkmark'
import PencilSquare from 'virtual:icons/proicons/compose'

const appCtx = getSurfaceCtx()

let isEditing = $state(false)
let draftTitle = $state('')
let titleInput = $state<HTMLInputElement | null>(null)
let originalTitle = $state('')

const currentTitle = $derived(
  appCtx.draft.current?.feature?.i18n?.[getLocaleKey()]?.title?.trim() ?? '',
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
    appCtx.draft.updateI18n('title', originalTitle)
    draftTitle = originalTitle
    isEditing = false
    return
  }

  appCtx.draft.updateI18n('title', draftTitle.trim())
  isEditing = false
}

function cancelEditing(): void {
  appCtx.draft.updateI18n('title', originalTitle)
  draftTitle = originalTitle
  isEditing = false
}
</script>

<div class="space-y-2">
  <p class="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
    Title
  </p>

  <div class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    {#if isEditing}
      <input
        bind:this={titleInput}
        bind:value={draftTitle}
        type="text"
        class="h-11 min-w-0 w-full rounded-full border border-border-input bg-base-200 px-4 text-left text-base font-semibold text-base-content caret-base-content placeholder:text-muted-foreground focus:border-border-input-hover focus:outline-none"
        placeholder={m.fluffy_wide_ladybug_file()}
        oninput={() => {
          appCtx.draft.updateI18n('title', draftTitle)
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
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-input bg-base-content/8 text-base-content transition hover:bg-base-content/12"
        onclick={saveTitle}
        disabled={!draftTitle.trim()}
      >
        <Icon src={Check} class="h-5 w-5 text-primary" />
      </button>
    {:else}
      <button
        type="button"
        class="flex h-11 min-w-0 w-full items-center rounded-full border border-border-input bg-base-200 px-4 text-left transition hover:bg-base-300"
        onclick={startEditing}
      >
        <p
          class={`!block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold ${currentTitle ? 'text-base-content' : 'text-muted-foreground'}`}
        >
          {currentTitle || m.empty_lofty_meerkat_support()}
        </p>
      </button>
      <button
        type="button"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-input bg-base-200 text-base-content transition hover:bg-base-300"
        onclick={startEditing}
        aria-label="Edit title"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
