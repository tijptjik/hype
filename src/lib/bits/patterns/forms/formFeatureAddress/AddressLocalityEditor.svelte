<script lang="ts">
// SVELTE
import { tick, type Snippet } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
// DOMAIN
import {
  addressDivisionName,
  addressLocalityLevel,
  localityParentPaths,
} from '#lib/addresses/divisions.js'
// TYPES
import type { AddressDivision } from '#lib/addresses/divisions.js'

let {
  paths,
  options,
  node,
  labels,
  onChange,
  onReset,
}: {
  paths: AddressDivision[][]
  options: AddressDivision[]
  node: Snippet<[AddressDivision]>
  labels: Record<string, string>
  onChange: (paths: AddressDivision[][]) => void
  onReset: () => void
} = $props()
const uid = $props.id()
let searching = $state(false)
let query = $state('')
let pending = $state<AddressDivision | null>(null)
let unavailable = $state(false)
let input = $state<HTMLInputElement | null>(null)
const candidates = $derived(pending ? localityParentPaths(pending, options) : [])
const matching = $derived(
  options
    .filter(
      item =>
        addressLocalityLevel(item) !== null &&
        Object.values(item.names).some(value =>
          value.name?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        ),
    )
    .sort((a, b) =>
      addressDivisionName(a, getLocaleKey()).localeCompare(
        addressDivisionName(b, getLocaleKey()),
      ),
    ),
)
$effect(() => {
  if (searching) void tick().then(() => input?.focus())
})

/** Choose one neighbourhood, filling its unique ancestry or requesting one existing source branch.
 * @param selected Existing mirrored locality. @returns Nothing; no parent or edge can be authored here.
 */
function choose(selected: AddressDivision): void {
  const source = localityParentPaths(selected, options)
  unavailable = source.length === 0
  if (source.length === 1) commit([...source[0], selected])
  else pending = source.length ? selected : null
}

/** Replace the whole locality selection with one existing source path.
 * @param path The selected root-to-leaf source path. @returns Nothing; saving remains the owning form's responsibility.
 */
function commit(path: AddressDivision[]): void {
  onChange([path])
  close()
}

/** Close an incomplete selection without changing the saved draft.
 * @returns Nothing.
 */
function close(): void {
  searching = false
  pending = null
  unavailable = false
  query = ''
}
</script>

<div class="min-w-0 space-y-3">
  {#each paths as path (JSON.stringify(path.map(item => item.id)))}
    <ol
      class="flex flex-wrap items-start gap-x-3 gap-y-1"
      aria-label={m.address_neighbourhood_current()}
    >
      {#each path as division, index (division.id)}
        <li class="flex min-w-0 max-w-full items-start gap-3">
          {#if index > 0}
            <ChevronRightIcon
              class="mt-2 size-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
          {/if}
          {@render node(division)}
        </li>
      {/each}
    </ol>
  {/each}
  {#if searching}
    <div class="space-y-2 rounded-lg border border-border bg-panel p-3">
      <label class="block text-xs text-muted-foreground" for={`${uid}-search`}
        >{m.address_neighbourhood_search()}</label
      >
      <div class="flex items-center gap-2">
        <input
          bind:this={input}
          id={`${uid}-search`}
          type="search"
          bind:value={query}
          class="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          autocomplete="off"
          oninput={() => {
            pending = null
            unavailable = false
          }}
          onkeydown={event => {
            if (event.key === 'Escape') close()
            if (
              event.key === 'Enter' &&
              !pending &&
              query.trim() &&
              matching.length === 1
            ) {
              event.preventDefault()
              choose(matching[0])
            }
          }}
        >
        <button
          type="button"
          class="min-h-10 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted"
          onclick={close}
        >
          {m.cancel()}
        </button>
      </div>
      {#if pending}
        <fieldset
          class="min-w-0 space-y-2"
          aria-label={m.address_neighbourhood_choose_path({
            name: addressDivisionName(pending, getLocaleKey()),
          })}
        >
          <legend class="text-sm font-medium">
            {m.address_neighbourhood_choose_path({
              name: addressDivisionName(pending, getLocaleKey()),
            })}
          </legend>
          <p class="text-xs text-muted-foreground">
            {m.address_neighbourhood_paths_help()}
          </p>
          {#each candidates as path (JSON.stringify(path.map(item => item.id)))}
            <button
              type="button"
              class="block min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
              onclick={() => pending && commit([...path, pending])}
            >
              {[...path, pending]
                .map(item => addressDivisionName(item, getLocaleKey()))
                .join(' → ')}
            </button>
          {/each}
        </fieldset>
      {:else if unavailable}
        <p role="alert" class="text-sm text-destructive">
          {m.address_neighbourhood_unavailable()}
        </p>
      {:else if query.trim()}
        <fieldset
          class="max-h-64 min-w-0 overflow-y-auto rounded-md border border-border bg-background"
          aria-label={m.address_locality_results()}
        >
          {#each matching as option (option.id)}
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
              aria-label={`${addressDivisionName(option, getLocaleKey())} ${labels[option.class]}`}
              onclick={() => choose(option)}
            >
              <span>{addressDivisionName(option, getLocaleKey())}</span
              ><span class="text-xs text-muted-foreground">{labels[option.class]}</span>
            </button>
          {:else}
            <p class="px-3 py-2 text-sm text-muted-foreground">
              {m.address_locality_no_results()}
            </p>
          {/each}
        </fieldset>
      {/if}
    </div>
  {:else}
    <div class="group/selection flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="min-h-9 text-sm text-primary hover:underline"
        onclick={() => {
          searching = true
          query = ''
        }}
      >
        {m.address_neighbourhood_choose()}
      </button>
      {#if paths.length}
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover/selection:opacity-100 sm:group-focus-within/selection:opacity-100"
          aria-label={m.address_neighbourhood_clear()}
          title={m.address_neighbourhood_clear()}
          onclick={() => {
            onChange([])
            searching = true
          }}
        >
          <XIcon class="size-3.5" aria-hidden="true" />
        </button>
      {/if}
      <button
        type="button"
        class="min-h-9 text-xs text-muted-foreground hover:underline"
        onclick={() => {
          close()
          onReset()
        }}
      >
        {m.address_divisions_from_marker()}
      </button>
    </div>
  {/if}
</div>
