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
let draftDescription = $state('')
let descriptionInput = $state<HTMLTextAreaElement | null>(null)

const currentDescription = $derived(
  appCtx.draft.current?.feature?.i18n?.[getLocaleKey()]?.description?.trim() ?? '',
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

  appCtx.draft.updateI18n('description', draftDescription.trim())
  isEditing = false
}

function cancelEditing(): void {
  appCtx.draft.updateI18n('description', currentDescription)
  draftDescription = currentDescription
  isEditing = false
}
</script>

<div class="space-y-2">
  <p class="text-muted-foreground font-mono text-[11px] tracking-[0.28em] uppercase">
    Description
  </p>

  <div class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
    {#if isEditing}
      <textarea
        bind:this={descriptionInput}
        bind:value={draftDescription}
        class="border-border-input bg-base-200 text-base-content caret-base-content placeholder:text-muted-foreground focus:border-border-input-hover min-h-28 w-full min-w-0 rounded-[1.5rem] border px-4 py-3 text-left text-sm leading-6 focus:outline-none"
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
        class="border-border-input bg-base-content/8 text-base-content hover:bg-base-content/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={saveDescription}
        disabled={!draftDescription.trim()}
      >
        <Icon src={Check} class="text-primary h-5 w-5" />
      </button>
    {:else}
      <button
        type="button"
        class="border-border-input bg-base-200 hover:bg-base-300 flex min-h-28 w-full min-w-0 items-start rounded-[1.5rem] border px-4 py-3 text-left transition"
        onclick={startEditing}
      >
        <p
          class={`text-sm leading-6 ${currentDescription ? 'text-muted-foreground' : 'text-muted-foreground font-semibold'}`}
        >
          {currentDescription || m.zany_merry_seahorse_treasure()}
        </p>
      </button>
      <button
        type="button"
        class="border-border-input bg-base-200 text-base-content hover:bg-base-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition"
        onclick={startEditing}
        aria-label="Edit description"
      >
        <Icon src={PencilSquare} class="h-5 w-5" />
      </button>
    {/if}
  </div>
</div>
