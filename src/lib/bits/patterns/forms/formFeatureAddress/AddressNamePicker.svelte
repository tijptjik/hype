<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/building-2'
import StreetIcon from 'virtual:icons/lucide/road'
// DOMAIN
import { loadAddressNames, type AddressName } from '#lib/addresses/nameCatalogue.js'
import { addressNameLabel, searchAddressNames } from '#lib/addresses/nameSearch.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'

let { family, value, label, locale, onSelect }: {
  family: 'streets' | 'buildings'
  value: string
  label: string
  locale: LocaleKey
  onSelect: (record: AddressName | null) => void
} = $props()
const uid = $props.id()
let rows = $state<AddressName[]>([])
let query = $state('')
let open = $state(false)
let replacing = $state(false)
let input: HTMLInputElement | undefined = $state()
let selection: HTMLButtonElement | undefined = $state()
let failed = $state(false)
let loading = $state(true)
let active = $state(-1)
const matches = $derived(searchAddressNames(rows, query, locale))
// Search text is a draft; the selected value changes only when a source result is chosen.
/** Open a blank replacement search without clearing the saved selection. @returns Completion after focus moves. */
async function replace(): Promise<void> {
  replacing = true
  query = ''
  active = -1
  await tick()
  input?.focus()
}
/** Discard the search draft and restore the selected tile. @param focus Restore keyboard focus to the tile. @returns Nothing. */
function cancel(focus = false): void {
  replacing = false
  open = false
  query = ''
  active = -1
  if (focus) void tick().then(() => selection?.focus())
}

/** Wait for focus to settle after swapping the selected tile for its input.
 * @param event Focus leaving a child control. @returns Nothing.
 */
function focusout(event: FocusEvent & { currentTarget: EventTarget & HTMLDivElement }): void {
  const root = event.currentTarget
  setTimeout(() => {
    if (root.isConnected && !root.contains(document.activeElement)) cancel()
  }, 0)
}

/** Retrieve the controlled vocabulary, exposing retry on failure. @returns Completion. */
async function load(): Promise<void> {
  loading = true
  failed = false
  try { rows = await loadAddressNames(family) }
  catch (error) { failed = true; console.error(`Could not load ${family} names`, error) }
  finally { loading = false }
}
/** Commit a source selection and restore the display value. @param row Chosen name. @returns Nothing. */
function select(row: AddressName | null): void {
  onSelect(row)
  cancel(true)
}
/** Navigate suggestions without submitting the containing form. @param event Input keyboard event. @returns Nothing. */
function keydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(true); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open = true
    active = matches.length ? (active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length) : -1
    void tick().then(() => document.getElementById(`${uid}-name-${active}`)?.scrollIntoView({ block: 'nearest' }))
  } else if (event.key === 'Enter' && open) {
    event.preventDefault()
    if (matches[active]) select(matches[active])
  }
}
// Preload the catalogue when the containing page mounts its pickers.
onMount(() => { void load() })
</script>

<div class="relative min-w-0 flex-1" onfocusout={focusout}>
  {#if value && !replacing}
    <div class="group/name flex items-center gap-2">
      <button bind:this={selection} type="button" title={m.replace()} aria-label={`${m.replace()}: ${value}`}
        class="group/tile flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        onclick={() => void replace()}>
        {#if family === 'buildings'}<BuildingIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {:else}<StreetIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />{/if}
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold">{value}</span>
          <span class="block text-xs text-muted-foreground group-hover/tile:hidden group-focus-visible/tile:hidden">{label}</span>
          <span class="hidden text-xs text-primary group-hover/tile:block group-focus-visible/tile:block">{m.replace()}</span>
        </span>
      </button>
      <button type="button" aria-label={m.address_name_clear()} title={m.address_name_clear()} class="rounded px-2 py-1 text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover/name:opacity-100" onclick={() => select(null)}>×</button>
    </div>
  {:else}
  <div class="flex items-center gap-2">
    <input bind:this={input}
      role="combobox"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${uid}-names`}
      aria-activedescendant={open && active >= 0 ? `${uid}-name-${active}` : undefined}
      autocomplete="off"
      bind:value={query}
      placeholder={m.address_name_search()}
      class="min-w-0 flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm"
      onfocus={() => { open = true; active = -1 }}
      oninput={() => { open = true; active = -1 }}
      onkeydown={keydown}
    />
    {#if value}
      <button type="button" class="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted" onclick={() => cancel(true)}>{m.cancel()}</button>
    {/if}
  </div>
  {#if open}
    <div class="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-panel p-1 shadow-lg">
      {#if loading}
        <p role="status" class="px-3 py-2 text-sm">{m.resource_loading()}</p>
      {:else if failed}
        <p role="status" class="px-3 py-2 text-sm">{m.address_names_unavailable()}</p>
        <button type="button" class="px-3 py-2 text-sm underline" onclick={() => void load()}>{m.feature_start_retry()}</button>
      {/if}
      <div id={`${uid}-names`} role="listbox" aria-label={label}>
        {#if !loading && !failed}
          {#each matches as row, index (row.id)}
            <div id={`${uid}-name-${index}`} role="option" aria-selected={active === index} tabindex="-1"
              class={['flex items-center justify-between gap-3 cursor-pointer rounded px-3 py-2 text-sm hover:bg-muted', active === index && 'bg-muted']}
              onpointerdown={event => event.preventDefault()}
              onclick={() => select(row)}
              onkeydown={event => { if (event.key === 'Enter') select(row) }}>
              <span class="min-w-0">{addressNameLabel(row, locale)}</span>
              <span class="ml-auto shrink-0 text-right text-xs text-muted-foreground">{row.divisionCodes.join(' · ')}</span>
            </div>
          {/each}
        {/if}
      </div>
      {#if !loading && !failed && !matches.length}<p role="status" class="px-3 py-2 text-sm">{m.feature_start_empty()}</p>{/if}
    </div>
  {/if}
  {/if}
</div>
