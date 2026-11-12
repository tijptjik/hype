<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import { fetchNameSuggestions } from '#lib/addresses/nameSuggestions.js'
import { addressNameLabel } from '#lib/addresses/nameSearch.js'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
// TYPES
import type { LocaleKey } from '#lib/types.js'

let {
  value,
  label,
  locale,
  family,
  multiline = false,
  minimumHeight = 36,
  overridden = false,
  focusOnMount = false,
  invalid = false,
  onChange,
  onSelect,
  onPending,
  onBlur,
}: {
  value: string
  label: string
  locale: LocaleKey
  family?: 'streets' | 'buildings'
  multiline?: boolean
  minimumHeight?: number
  overridden?: boolean
  focusOnMount?: boolean
  invalid?: boolean
  onChange: (value: string) => void
  onSelect?: (record: AddressName) => void
  onPending?: (pending: boolean) => void
  onBlur?: () => void
} = $props()
const uid = $props.id()
let input: HTMLInputElement | HTMLTextAreaElement | undefined = $state()
let draft: string | null = $state(null)
let rows = $state.raw<AddressName[]>([])
let loading = $state(false)
let retry = $state(0)
let failed = $state(false)
let open = $state(false)
let active = $state(-1)
let pointerDown = false
let pendingBlur = false
let blurTimer: ReturnType<typeof setTimeout>
const text = $derived(draft ?? value)
const pending = $derived(family === 'streets' && draft !== null && draft !== value)
const matches = $derived(rows.slice(0, 8))
$effect(() => onPending?.(pending))
// A catalogue selection can update all languages while their inputs remain mounted.
$effect(() => {
  value
  draft = null
})
onMount(() => {
  resizeText()
  if (focusOnMount) input?.focus()
})
onDestroy(() => {
  clearTimeout(blurTimer)
  onPending?.(false)
})

/** Keep wrapped names fully visible without shrinking below their display height.
 * @returns Nothing.
 */
function resizeText(): void {
  if (!(input instanceof HTMLTextAreaElement)) return
  input.style.height = 'auto'
  input.style.height = Math.max(minimumHeight, input.scrollHeight + 2) + 'px'
}
/** Let an outside click finish before replacing a wrapping input with display text.
 * @returns Nothing; keyboard blur still closes immediately.
 */
function finishPointer(): void {
  pointerDown = false
  if (pendingBlur)
    blurTimer = setTimeout(() => {
      pendingBlur = false
      onBlur?.()
    }, 0)
}

// Debounce public suggestions and fence responses when a different field opens.
$effect(() => {
  const query = text.trim()
  const vocabulary = family
  const language = locale
  retry
  rows = []
  failed = false
  if (!open || !vocabulary || !query) {
    loading = false
    return
  }
  loading = true
  const controller = new AbortController()
  const timer = setTimeout(() => {
    void fetchNameSuggestions(vocabulary, query, language, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) rows = result
      })
      .catch(() => {
        if (!controller.signal.aborted) failed = true
      })
      .finally(() => {
        if (!controller.signal.aborted) loading = false
      })
  }, 180)
  return () => {
    clearTimeout(timer)
    controller.abort()
  }
})
/** Accept authored text without claiming a catalogue identity.
 * @returns Nothing; the parent retains the edit as an explicit correction.
 */
function useCustom(): void {
  onChange(text.trim())
  draft = null
  open = false
  onPending?.(false)
  onBlur?.()
}
/** Commit a known name with its multilingual catalogue record.
 * @param record Explicitly selected suggestion. @returns Nothing.
 */
function select(record: AddressName): void {
  draft = null
  open = false
  onSelect?.(record)
}
/** Keep keyboard navigation inside suggestions and never submit the containing form.
 * @param event Input keyboard event. @returns Nothing.
 */
function keydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (!family) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onBlur?.()
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    draft = null
    open = false
    onBlur?.()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open = true
    active = matches.length
      ? (active + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
      : -1
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (open && matches[active]) select(matches[active])
    else if (family === 'buildings') {
      open = false
      onBlur?.()
    }
  }
}
</script>

<svelte:window
  onpointerdown={() => (pointerDown = true)}
  onpointerup={finishPointer}
  onpointercancel={finishPointer}
/>
<div
  class="relative min-w-0"
  onfocusout={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      open = false
      if (pointerDown) pendingBlur = true
      else onBlur?.()
    }
  }}
>
  {#if multiline}
    <textarea
      bind:this={input}
      value={text}
      aria-label={label}
      aria-invalid={invalid}
      rows="1"
      maxlength="1000"
      style:min-height={minimumHeight + 'px'}
      class="border-border bg-background focus-visible:border-foreground/50 block w-full min-w-0 resize-none overflow-hidden rounded border py-1 pr-4 text-sm font-semibold break-words whitespace-pre-wrap focus-visible:outline-none"
      onkeydown={keydown}
      oninput={event => {
        draft = event.currentTarget.value
        onChange(draft)
        resizeText()
      }}
    ></textarea>
  {:else}
    <!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: Combobox role and attributes are enabled together for catalogue fields. -->
    <input
      bind:this={input}
      value={text}
      aria-label={label}
      aria-invalid={invalid || pending}
      role={family ? 'combobox' : undefined}
      aria-autocomplete={family ? 'list' : undefined}
      aria-expanded={family ? open : undefined}
      aria-controls={family ? `${uid}-names` : undefined}
      aria-activedescendant={family && open && active >= 0
        ? `${uid}-${active}`
        : undefined}
      aria-describedby={pending ? `${uid}-pending` : undefined}
      autocomplete="off"
      maxlength="1000"
      class="border-border bg-background focus-visible:border-foreground/50 min-h-9 w-full min-w-0 rounded border py-1 pr-6 pl-2 text-sm font-semibold focus-visible:outline-none"
      onfocus={() => {
        if (family) {
          open = true
        }
      }}
      onkeydown={keydown}
      oninput={event => {
        draft = event.currentTarget.value
        active = -1
        open = Boolean(family)
        if (family !== 'streets') onChange(draft)
      }}
    >
  {/if}
  {#if overridden}
    <span
      role="img"
      aria-label={m.association_override()}
      class="bg-primary pointer-events-none absolute top-[15px] right-2 size-1.5 rounded-full"
    ></span>
  {/if}
  {#if pending}
    <span id={`${uid}-pending`} class="text-muted-foreground mt-1 block text-[10px]"
      >{m.association_choose_street()}</span
    >
  {/if}
  {#if family && open}
    <div
      class="border-border bg-panel absolute top-full left-0 z-30 mt-1 max-h-56 w-full min-w-0 overflow-y-auto rounded-md border p-1 shadow-lg"
    >
      {#if loading}
        <div
          role="status"
          aria-label={family === 'streets'
            ? m.address_streets_loading()
            : m.address_buildings_loading()}
          aria-busy="true"
        >
          {#each Array(3) as _, index (index)}
            <div class="w-full rounded p-2 text-left text-xs">
              <LoadingSkeleton rows={1} />
            </div>
          {/each}
        </div>
      {/if}
      {#if failed}
        <button type="button" class="p-2 text-xs underline" onclick={() => retry++}>
          {m.address_names_unavailable()}
          · {m.feature_start_retry()}
        </button>
      {/if}
      {#if text.trim()}
        <button
          type="button"
          class="hover:bg-muted w-full rounded p-2 text-left text-xs"
          onpointerdown={event => event.preventDefault()}
          onclick={useCustom}
        >
          {m.address_name_use_custom({ name: text.trim() })}
        </button>
      {/if}
      <div id={`${uid}-names`} role="listbox" aria-label={label}>
        {#each matches as record, index (record.id)}
          <button
            type="button"
            role="option"
            id={`${uid}-${index}`}
            aria-selected={active === index}
            class="block w-full min-w-0 whitespace-normal break-words rounded p-2 text-left text-xs hover:bg-muted focus-visible:bg-muted {active ===
            index
              ? 'bg-muted'
              : ''}"
            onpointerdown={event => event.preventDefault()}
            onclick={() => select(record)}
          >
            {addressNameLabel(record, locale)}
          </button>
        {/each}
      </div>
      {#if !loading && !failed && !matches.length}
        <p role="status" class="text-muted-foreground p-2 text-xs">
          {m.feature_start_empty()}
        </p>
      {/if}
      {#if family === 'buildings'}
        <p class="border-border text-muted-foreground border-t px-2 py-1 text-[10px]">
          {m.association_custom_building()}
        </p>
      {/if}
    </div>
  {/if}
</div>
