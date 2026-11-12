<script lang="ts">
// ADDRESS LOCALES
import { addressLocaleLabel } from './addressLocaleLabel.js'
// SVELTE
import { tick, untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
import WarningIcon from 'virtual:icons/lucide/triangle-alert'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import BuildingIcon from 'virtual:icons/lucide/building-2'
import StreetIcon from 'virtual:icons/lucide/road'
// COMPONENTS
import ScrollableText from '#lib/bits/custom/text/ScrollableText.svelte'
// DOMAIN
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import { fetchNameSuggestions } from '#lib/addresses/nameSuggestions.js'
import { addressNameLabel } from '#lib/addresses/nameSearch.js'
import { streetDisplayName } from '#lib/addresses/formatting.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'

let {
  family,
  value,
  label,
  locale,
  showLocale = false,
  prominent = false,
  detached = false,
  onSelect,
  onCustom,
  onClear,
  onReplacingChange,
  onBlur,
}: {
  family: 'streets' | 'buildings'
  value: string
  label: string
  locale: LocaleKey
  showLocale?: boolean
  prominent?: boolean
  detached?: boolean
  onClear?: () => void
  onBlur?: () => void
  onSelect: (record: AddressName | null) => void
  onCustom?: (value: string) => void
  onReplacingChange?: (replacing: boolean) => void
} = $props()
const uid = $props.id()
let rows = $state.raw<AddressName[]>([])
let query = $state('')
let open = $state(false)
let replacing = $state(false)
let selectionChanged = false
let pickerRoot: HTMLDivElement | undefined = $state()
let input: HTMLInputElement | undefined = $state()
let selection: HTMLButtonElement | undefined = $state()
let failed = $state(false)
let loading = $state(false)
let retry = $state(0)
let active = $state(-1)
const loadingMessage = $derived(
  family === 'streets' ? m.address_streets_loading() : m.address_buildings_loading(),
)
const displayValue = $derived(
  family === 'streets' ? streetDisplayName(value, locale) : value,
)
// Only bounded API results enter reactive state; obsolete requests cannot replace newer input.
const matches = $derived(rows)
$effect(() => {
  const text = query.trim()
  const vocabulary = family
  const language = locale
  retry
  rows = []
  failed = false
  active = -1
  if (!open || !text) {
    loading = false
    return
  }
  const controller = new AbortController()
  loading = true
  const timer = setTimeout(() => {
    void fetchNameSuggestions(vocabulary, text, language, controller.signal)
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

/** Keep custom text separate from catalogue identity and published translations.
 * @returns Nothing; only the active language receives authored text.
 */
function selectCustom(): void {
  if (!query.trim() || !onCustom) return
  selectionChanged = true
  onCustom(query.trim())
  cancel(true)
}
// Group clear/reset can change this language while a request is pending.
$effect(() => {
  value
  untrack(() => cancel())
})
// Search text is a draft; the selected value changes only when a source result is chosen.
/** Open an empty replacement search without clearing the saved selection. @returns Completion after focus moves. */
async function replace(): Promise<void> {
  replacing = true
  query = ''
  onReplacingChange?.(true)
  active = -1
  await tick()
  input?.focus()
}
/** Discard the search draft and restore the selected tile. @param focus Restore keyboard focus to the tile. @returns Nothing. */
function cancel(focus = false): void {
  replacing = false
  onReplacingChange?.(false)
  open = false
  query = ''
  active = -1
  if (focus) void tick().then(() => selection?.focus())
}

/** Wait for focus to settle after swapping the selected tile for its input.
 * @param event Focus leaving a child control. @returns Nothing.
 */
function focusout(
  event: FocusEvent & { currentTarget: EventTarget & HTMLDivElement },
): void {
  const root = pickerRoot ?? event.currentTarget
  setTimeout(() => {
    if (
      root.isConnected &&
      !root.contains(document.activeElement) &&
      !document.getElementById(`${uid}-names`)?.contains(document.activeElement)
    ) {
      cancel()
      // Leaving an unchanged tile or a cancelled search is navigation, not a new association.
      if (selectionChanged) {
        selectionChanged = false
        onBlur?.()
      }
    }
  }, 0)
}

/** Commit a source selection and restore the display value. @param row Chosen name. @returns Nothing. */
function select(row: AddressName | null): void {
  selectionChanged = true
  onSelect(row)
  cancel(true)
}
/** Navigate suggestions without submitting the containing form. @param event Input keyboard event. @returns Nothing. */
function keydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel(true)
    return
  }
  if (
    event.key === 'Tab' &&
    !event.shiftKey &&
    open &&
    !loading &&
    !failed &&
    matches.length
  ) {
    event.preventDefault()
    active = 0
    document.getElementById(`${uid}-name-0`)?.focus()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open = true
    active = matches.length
      ? active < 0
        ? event.key === 'ArrowDown'
          ? 0
          : matches.length - 1
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
          matches.length
      : -1
    void tick().then(() =>
      document
        .getElementById(`${uid}-name-${active}`)
        ?.scrollIntoView({ block: 'nearest' }),
    )
  } else if (event.key === 'Enter' && open) {
    event.preventDefault()
    if (matches[active]) select(matches[active])
    else selectCustom()
  }
}
/** Keep suggestions outside horizontal field clipping and reveal them in the editor pane.
 * @param node Suggestion menu. @returns Observer and event cleanup.
 * @remarks The menu follows its input while scrolling; loaded results trigger a new fit.
 */
function revealMenu(node: HTMLElement): { destroy: () => void } {
  const anchor = node.parentElement
  if (!anchor) return { destroy: () => {} }
  document.body.append(node)
  node.style.position = 'fixed'
  node.style.right = 'auto'
  node.style.zIndex = '100'
  const position = (): void => {
    const rect = anchor.getBoundingClientRect()
    node.style.left = `${rect.left}px`
    node.style.top = `${rect.bottom}px`
    node.style.width = `${rect.width}px`
  }
  const reveal = (): void => {
    let parent = anchor.parentElement
    while (parent) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
        const bottom = Math.min(parent.getBoundingClientRect().bottom, innerHeight)
        const required = anchor.getBoundingClientRect().bottom + node.offsetHeight + 8
        if (required > bottom) parent.scrollTop += required - bottom
      }
      parent = parent.parentElement
    }
    const required = anchor.getBoundingClientRect().bottom + node.offsetHeight + 8
    if (required > innerHeight) window.scrollBy(0, required - innerHeight)
    position()
  }
  const observer = new ResizeObserver(reveal)
  observer.observe(node)
  window.addEventListener('scroll', position, true)
  window.addEventListener('resize', reveal)
  position()
  return {
    destroy: () => {
      observer.disconnect()
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', reveal)
      node.remove()
    },
  }
}
// The selected name needs no catalogue; load suggestions only when its input opens.
</script>

<div bind:this={pickerRoot} class="flex min-w-0 flex-1 items-center gap-2">
  {#if showLocale}
    <span
      aria-hidden="true"
      class="text-muted-foreground w-[3em] shrink-0 font-mono text-xs"
      >{addressLocaleLabel(locale)}</span
    >
  {/if}
  <div class="relative min-w-0 flex-1" onfocusout={focusout}>
    {#if value && !replacing}
      <div
        class="group/name hover:bg-foreground/5 has-[:focus-visible]:outline-foreground/40 relative flex items-center rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2"
      >
        <button
          bind:this={selection}
          type="button"
          aria-label={`${m.replace()}: ${displayValue}`}
          class="group/tile grid min-w-0 flex-1 {prominent
            ? 'grid-cols-[1.75rem_minmax(0,1fr)]'
            : 'grid-cols-[1rem_minmax(0,1fr)]'} items-center gap-x-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none"
          onclick={() => void replace()}
        >
          {#if family === 'buildings'}
            <BuildingIcon
              class="text-muted-foreground col-start-1 row-start-1 {prominent
                ? 'size-7'
                : 'size-4'}"
            />
          {:else}
            <StreetIcon
              class="text-muted-foreground col-start-1 row-start-1 {prominent
                ? 'size-7'
                : 'size-4'}"
            />
          {/if}
          <!-- Measure the single name at its natural width; the Firefox-safe scroller handles constraints. -->
          <span
            aria-hidden="true"
            class="invisible col-start-2 row-start-1 {prominent
              ? 'text-base leading-7'
              : 'text-sm leading-5'} font-semibold whitespace-pre"
            >{displayValue}</span
          >
          <ScrollableText
            text={displayValue}
            title=""
            class="col-start-2 row-start-1 min-w-0 [contain:inline-size]"
            containerClass={prominent
              ? 'h-7 text-base leading-7'
              : 'h-5 text-sm leading-5'}
            textClass={prominent
              ? 'text-base font-semibold leading-7'
              : 'text-sm font-semibold leading-5'}
          />
          {#if !prominent}
            <span
              class="text-muted-foreground col-start-2 row-start-2 block text-xs group-hover/tile:hidden group-focus-visible/tile:hidden"
              >{label}</span
            >
            <span
              class="text-foreground col-start-2 row-start-2 hidden text-xs group-hover/tile:block group-focus-visible/tile:block"
              >{m.replace()}</span
            >
          {/if}
        </button>
        {#if onClear}
          <button
            type="button"
            aria-label={`${m.filters__clear()}: ${displayValue} · ${addressLocaleLabel(locale)}`}
            data-tooltip={m.filters__clear()}
            class="text-muted-foreground hover:text-primary focus-visible:outline-primary mr-1 flex size-7 shrink-0 items-center justify-center rounded opacity-0 group-focus-within/name:opacity-100 group-hover/name:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 [@media(hover:none)]:opacity-100"
            onclick={onClear}
          >
            <XIcon class="size-3.5" aria-hidden="true" />
          </button>
        {/if}
        {#if detached}
          <SimpleTooltip triggerProps={{ tabindex: -1 }}>
            {#snippet trigger()}
              <button
                type="button"
                aria-label={m.address_detached_name()}
                class="ml-1 flex size-6 shrink-0 items-center justify-center text-amber-500"
              >
                <WarningIcon class="size-4" />
              </button>
            {/snippet}
            {m.address_detached_name()}
          </SimpleTooltip>
        {/if}
      </div>
    {:else}
      <div class="flex items-center gap-2">
        <input
          bind:this={input}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${uid}-names`}
          aria-activedescendant={open && active >= 0
            ? `${uid}-name-${active}`
            : undefined}
          autocomplete="off"
          maxlength="160"
          bind:value={query}
          placeholder={loading
            ? loadingMessage
            : (family === 'buildings'
                ? m.address_example_building
                : m.address_example_street)(
                {},
                {
                  locale:
                    locale === 'en'
                      ? 'en'
                      : locale === 'zhHant'
                        ? 'zh-hant'
                        : 'zh-hans',
                },
              )}
          class="border-border-input bg-panel text-foreground placeholder:text-muted-foreground/65 h-12 min-w-0 flex-1 rounded-lg border px-3 py-2 text-base placeholder:italic"
          onfocus={() => {
            open = true
            active = -1
          }}
          oninput={() => {
            open = true
            active = -1
          }}
          onkeydown={keydown}
        >
        {#if value}
          <button
            type="button"
            aria-label={m.cancel()}
            data-tooltip={m.cancel()}
            class="text-muted-foreground hover:bg-muted focus-visible:outline-primary flex size-10 shrink-0 items-center justify-center rounded focus-visible:outline-2"
            onclick={() => cancel(true)}
          >
            ×
          </button>
        {/if}
      </div>
      {#if open}
        <div
          use:revealMenu
          onfocusout={focusout}
          class="border-border bg-panel absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border p-1 shadow-lg"
        >
          {#if !query.trim()}
            <p class="text-muted-foreground px-3 py-2 text-sm">
              {m.address_names_type_hint()}
            </p>
          {/if}
          {#if loading}
            <p role="status" class="px-3 py-2 text-sm">{loadingMessage}</p>
          {:else if failed}
            <p role="status" class="px-3 py-2 text-sm">
              {m.address_names_unavailable()}
            </p>
            <button
              type="button"
              class="px-3 py-2 text-sm underline"
              onclick={() => retry++}
            >
              {m.feature_start_retry()}
            </button>
          {/if}
          {#if query.trim() && onCustom}
            <button
              type="button"
              class="hover:bg-muted focus-visible:outline-primary w-full rounded px-3 py-2 text-left text-sm"
              onpointerdown={event => event.preventDefault()}
              onclick={selectCustom}
            >
              {m.address_name_use_custom({ name: query.trim() })}
            </button>
            <p class="text-muted-foreground px-3 pb-2 text-xs">
              {m.address_name_custom_help()}
            </p>
          {/if}
          <div id={`${uid}-names`} role="listbox" aria-label={label}>
            {#if !loading && !failed}
              {#each matches as row, index (row.id)}
                <div
                  id={`${uid}-name-${index}`}
                  role="option"
                  aria-selected={active === index}
                  tabindex="0"
                  class={[
                    'hover:bg-muted focus-visible:bg-muted focus-visible:outline-primary flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-sm focus-visible:outline-2',
                    active === index && 'bg-muted',
                  ]}
                  onpointerdown={event => event.preventDefault()}
                  onclick={() => select(row)}
                  onkeydown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      select(row)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      cancel(true)
                    }
                  }}
                >
                  <span class="min-w-0"
                    >{family === 'streets'
                      ? streetDisplayName(addressNameLabel(row, locale), locale)
                      : addressNameLabel(row, locale)}</span
                  >
                  <span
                    class="text-muted-foreground ml-auto shrink-0 text-right text-xs"
                    >{row.divisionCodes.join(' · ')}</span
                  >
                </div>
              {/each}
            {/if}
          </div>
          {#if query.trim() && !loading && !failed && !matches.length}
            <p role="status" class="px-3 py-2 text-sm">{m.feature_start_empty()}</p>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
