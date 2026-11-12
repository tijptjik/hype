<script lang="ts">
// SVELTE
import {
  acceptAllTranslationReview,
  translationReviewTabs,
} from '#lib/forms/translationReview.js'
import { onMount } from 'svelte'
import { fly } from 'svelte/transition'
import LanguagesIcon from 'virtual:icons/lucide/languages'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { TranslationSourceMode } from '#lib/forms/translationSource.js'
let {
  form,
  sourceFallback = false,
  allReady = false,
  completed = 0,
  total = 0,
  busy,
  pending,
  englishAvailable = true,
  onGenerate,
  onAccept,
  onSkip,
  onClose,
}: {
  form?: HTMLFormElement | null
  sourceFallback?: boolean
  details?: string[]
  completed?: number
  total?: number
  allReady?: boolean
  busy: boolean
  pending: boolean
  englishAvailable?: boolean
  onGenerate: (mode: TranslationSourceMode) => void
  onAccept: () => void
  onSkip: () => void
  onClose: () => void
} = $props()
const tabs = $derived(translationReviewTabs(form))
const tabLabels = $derived<Record<string, string>>({
  core: m.translation_tab_profile(),
  fields: m.translation_tab_fields(),
  policies: m.translation_tab_policies(),
  location: m.translation_tab_location(),
  capabilities: m.translation_tab_capabilities(),
  images: m.translation_tab_images(),
})
let panel: HTMLDivElement
let top = $state(72)
let left = $state(16)
const titleId = $props.id()
/** Locate the visible Save control when responsive headers keep both variants mounted. */
function saveControl(): HTMLElement | undefined {
  return [
    ...(form?.querySelectorAll<HTMLElement>('[data-header-save]') ?? []),
    ...document.querySelectorAll<HTMLElement>('[data-header-save]'),
  ].find(button => button.checkVisibility?.() ?? button.getClientRects().length > 0)
}
/** Dismiss the source chooser without saving and return focus to its Save trigger. */
function dismiss(): void {
  onClose()
  saveControl()?.focus()
}
onMount(() => {
  // Keep the dialogue outside scrolling form cards and align it beneath the actual Save control.
  const modal = form?.closest<HTMLElement>('[role="dialog"]')
  // Keep image-caption review inside its existing modal focus boundary.
  ;(modal ?? document.body).append(panel)
  if (modal) panel.style.position = 'absolute'
  const anchor = saveControl()
  const position = () => {
    const rect = saveControl()?.getBoundingClientRect()
    top = Math.max(8, rect ? rect.bottom + 10 : 72)
    const width = panel.getBoundingClientRect().width
    const centered = rect
      ? rect.left + rect.width / 2 - width / 2
      : (window.innerWidth - width) / 2
    left = Math.max(16, Math.min(centered, window.innerWidth - width - 16))
    if (modal) {
      const bounds = modal.getBoundingClientRect()
      left = Math.max(8, Math.min(left - bounds.left, bounds.width - width - 8))
      top = Math.max(
        8,
        Math.min(top - bounds.top, bounds.height - panel.offsetHeight - 8),
      )
    }
  }
  position()
  const observer = new ResizeObserver(position)
  if (anchor) observer.observe(anchor)
  observer.observe(panel)
  window.addEventListener('resize', position)
  window.addEventListener('scroll', position, true)
  panel.focus({ preventScroll: true })
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', position)
    window.removeEventListener('scroll', position, true)
    panel.remove()
  }
})
</script>
<div
  bind:this={panel}
  role="dialog"
  aria-labelledby={titleId}
  tabindex="-1"
  data-translation-dialog
  class="bg-panel text-foreground border-border fixed z-[1000] max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-lg border p-4 shadow-lg outline-none"
  style:top={`${top}px`}
  style:left={`${left}px`}
  in:fly={{ y: -12, duration: 180 }}
  onkeydown={event => {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation()
      dismiss()
    }
  }}
>
  <div class="flex items-start justify-between gap-3">
    <h2 id={titleId} class="text-base font-semibold">{m.translation_hub_title()}</h2>
    <button
      type="button"
      class="rounded px-2"
      aria-label={m.translation_hub_close()}
      disabled={busy}
      onclick={dismiss}
    >
      ×
    </button>
  </div>
  <p class="mt-2 text-sm">{m.translation_hub_missing()}</p>
  {#if tabs.length}
    <div class="border-border/60 mt-5 border-t pt-4">
      <h3 class="mb-3 text-sm font-semibold">{m.translation_review_tabs()}</h3>
      <nav class="flex flex-wrap gap-2" aria-label={m.translation_review_tabs()}>
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            disabled={busy}
            onclick={tab.open}
            class="border-border text-foreground hover:bg-muted/50 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {tabLabels[tab.id] ?? tab.id}
            <span class="text-muted-foreground text-xs"
              >{tab.count === 1
                ? m.translation_review_single_field()
                : m.translation_review_field_count({ count: tab.count })}</span
            >
          </button>
        {/each}
      </nav>
    </div>
  {/if}
  <div class="mt-6 flex flex-col gap-2">
    {#if busy}
      <p
        role="status"
        class="text-foreground flex min-h-24 flex-col items-center justify-center gap-3 py-5 text-center text-lg font-medium"
        in:fly={{ y: -6, duration: 150 }}
        out:fly={{ y: 6, duration: 100 }}
      >
        <LanguagesIcon class="size-6 animate-pulse" />
        {m.translation_hub_working()}
        {#if sourceFallback}
          {@const notice = m
            .translation_source_fallback({ language: '\uFFFC' })
            .split('\uFFFC')}
          <span class="text-muted-foreground/75 text-xs font-normal">
            {notice[0]}<em>{m.translation_source_closest()}</em>{notice[1]}
          </span>
        {/if}
        {#if total > 0}
          {completed}
          / {total}
        {/if}
      </p>
    {:else if !allReady}
      <div
        class="flex flex-col gap-2"
        in:fly={{ y: -6, duration: 150 }}
        out:fly={{ y: -6, duration: 100 }}
      >
        <button
          type="button"
          class="border-border text-foreground hover:bg-muted/50 flex items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-left text-sm disabled:opacity-50"
          disabled={busy || !englishAvailable}
          onclick={() => onGenerate('english')}
        >
          <LanguagesIcon class="size-4 shrink-0" />{m.translation_hub_english()}
        </button>
        <button
          type="button"
          class="border-border text-foreground hover:bg-muted/50 flex items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-left text-sm disabled:opacity-50"
          disabled={busy}
          onclick={() => onGenerate('nearest')}
        >
          <LanguagesIcon class="size-4 shrink-0" />{m.translation_hub_nearest()}
        </button>
      </div>
    {/if}
    {#if !busy && allReady}
      <button
        type="button"
        class="rounded-md bg-cyan-800 px-3 py-2 text-sm text-white! hover:bg-cyan-900 disabled:opacity-50"
        disabled={busy}
        onclick={() => {
          if (!acceptAllTranslationReview(form)) onAccept()
        }}
      >
        {pending ? m.translation_review_accept_all() : m.continue()}
      </button>
    {/if}
    <div
      class="text-muted-foreground flex items-center gap-3 py-1 text-xs"
      aria-hidden="true"
    >
      <hr class="border-border flex-1">
      <span>{m.translation_hub_or()}</span>
      <hr class="border-border flex-1">
    </div>
    <button
      type="button"
      class="text-muted-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
      disabled={busy}
      onclick={onSkip}
    >
      {m.translation_hub_skip()}
    </button>
  </div>
</div>
