<script lang="ts">
// SVELTE
import { tick, type Snippet } from 'svelte'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import XIcon from 'virtual:icons/lucide/x'
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
}: {
  paths: AddressDivision[][]
  options: AddressDivision[]
  node: Snippet<[AddressDivision]>
  labels: Record<string, string>
  onChange: (paths: AddressDivision[][]) => void
} = $props()
const uid = $props.id()
let searching = $state(false)
let query = $state('')
let pending = $state<AddressDivision | null>(null)
let unavailable = $state(false)
let input = $state<HTMLInputElement | null>(null)
let panel = $state<HTMLDivElement | null>(null)
let childOf = $state<AddressDivision[] | null>(null)
// Reuse the catalogue index across child checks and searches, rebuilding only when definitions change.
const definitions = $derived(new Map(options.map(item => [item.id, item])))
const candidates = $derived(pending ? availableParents(pending) : [])
const matching = $derived(
  options
    .filter(
      item =>
        addressLocalityLevel(item) !== null &&
        (!childOf || availableParents(item).length > 0) &&
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

/** Restrict child selection to direct children of the selected source chain.
 * @param division Candidate child. @returns Existing parent paths allowed in this picker.
 */
function availableParents(division: AddressDivision): AddressDivision[][] {
  return localityParentPaths(division, definitions).filter(
    path => !childOf || samePath(path, childOf),
  )
}

/** Compare exact root-to-leaf chains. @param a Candidate path. @param b Selected path. @returns Whether both chains match. */
function samePath(a: AddressDivision[], b: AddressDivision[]): boolean {
  return (
    a.length === b.length && a.every((division, index) => division.id === b[index].id)
  )
}

/** Check for a resolvable direct child. @param path Selected ancestor prefix. @returns Whether Add can extend this prefix. */
function hasChildren(path: AddressDivision[]): boolean {
  return options.some(option =>
    localityParentPaths(option, definitions).some(parents => samePath(parents, path)),
  )
}

/** Open global or child selection and clear any incomplete chain choice.
 * @param prefix Optional source chain to extend. @returns Nothing.
 */
function open(prefix: AddressDivision[] | null = null): void {
  close()
  if (prefix && !hasChildren(prefix)) return
  childOf = prefix
  searching = true
  void tick().then(() => input?.focus())
}

/** Choose one neighbourhood, filling its unique ancestry or requesting one existing source branch.
 * @param selected Existing mirrored locality. @returns Nothing; no parent or edge can be authored here.
 */
function choose(selected: AddressDivision): void {
  const source = availableParents(selected)
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
export function close(): void {
  childOf = null
  searching = false
  pending = null
  unavailable = false
  query = ''
}
</script>

<div class="group/selection relative min-w-0 space-y-3">
  {#each paths as path, pathIndex (pathIndex)}
    <ol
      class="flex flex-col items-stretch"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
      aria-label={m.address_neighbourhood_current()}
    >
      {#each path as division, index (division.id)}
        <li
          class="relative min-w-0"
          style:margin-left={`${index * 16}px`}
          transition:slide={{ duration: prefersReducedMotion.current ? 0 : 180 }}
        >
          <div class="flex min-w-0 items-start gap-1">
            <button
              type="button"
              class="hover:text-primary min-w-0 flex-1 text-left"
              aria-label={index === path.length - 1
                ? m.address_neighbourhood_choose()
                : addressDivisionName(division, getLocaleKey())}
              onclick={() => {
                open()
              }}
            >
              {@render node(division)}
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mt-1 flex size-7 shrink-0 items-center justify-center rounded-md"
              aria-label={`${m.address_neighbourhood_clear()}: ${addressDivisionName(division, getLocaleKey())}`}
              data-tooltip={m.address_neighbourhood_clear()}
              onclick={() => {
                // Keep the valid ancestor prefix when removing this branch of the hierarchy.
                onChange(
                  paths
                    .map((current, currentIndex) =>
                      currentIndex === pathIndex ? current.slice(0, index) : current,
                    )
                    .filter(current => current.length),
                )
                close()
              }}
            >
              <XIcon class="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {#if index < path.length - 1 || hasChildren(path)}
            <span
              class="border-muted-foreground/35 pointer-events-none absolute top-7 -bottom-4 left-[7px] w-2 rounded-bl border-b border-l"
              aria-hidden="true"
            ></span>
          {/if}
        </li>
      {/each}
      {#if path.length && hasChildren(path)}
        <li
          class="flex items-start gap-3"
          style:margin-left={`${path.length * 16}px`}
          data-locality-child-slot
        >
          <button
            type="button"
            aria-label={`${m.address_neighbourhood_add()}: ${addressDivisionName(path[path.length - 1], getLocaleKey())}`}
            class="text-primary hover:bg-muted focus-visible:outline-primary mt-1 rounded-md px-2 py-1 text-xs focus-visible:outline-2"
            onclick={() => open(path)}
          >
            {m.address_neighbourhood_add()}
          </button>
        </li>
      {/if}
    </ol>
  {/each}
  {#if searching && (!childOf || hasChildren(childOf))}
    <div bind:this={panel} class="min-w-0 space-y-2">
      <label class="sr-only" for={`${uid}-search`}
        >{m.address_neighbourhood_search()}</label
      >
      <div class="flex items-center gap-2">
        <input
          bind:this={input}
          id={`${uid}-search`}
          type="search"
          placeholder={m.address_neighbourhood_search()}
          bind:value={query}
          class="border-border bg-background min-h-10 min-w-0 flex-1 rounded-md border px-3 text-sm"
          autocomplete="off"
          oninput={() => {
            pending = null
            unavailable = false
          }}
          onkeydown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
            if (event.key === 'Tab' && !event.shiftKey) {
              const first = panel?.querySelector<HTMLButtonElement>('fieldset button')
              if (first) {
                event.preventDefault()
                first.focus()
              }
            }
            if (
              event.key === 'Enter' &&
              !pending &&
              (query.trim() || childOf) &&
              matching.length === 1
            ) {
              event.preventDefault()
              choose(matching[0])
            }
          }}
        >
        <button
          type="button"
          aria-label={m.cancel()}
          class="text-muted-foreground hover:bg-muted focus-visible:outline-primary flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2"
          onclick={close}
        >
          <XIcon class="size-4" aria-hidden="true" />
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
          {#each candidates as path (JSON.stringify(path.map(item => item.id)))}
            <button
              type="button"
              class="border-border bg-background hover:bg-muted focus-visible:bg-muted block min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm"
              onclick={() => pending && commit([...path, pending])}
            >
              {[...path, pending]
                .map(item => addressDivisionName(item, getLocaleKey()))
                .join(' → ')}
            </button>
          {/each}
        </fieldset>
      {:else if unavailable}
        <p role="alert" class="text-destructive text-sm">
          {m.address_neighbourhood_unavailable()}
        </p>
      {:else if query.trim() || childOf}
        <fieldset
          class="border-border bg-background max-h-64 min-w-0 overflow-y-auto rounded-md border"
          aria-label={m.address_locality_results()}
        >
          {#each matching as option (option.id)}
            <button
              type="button"
              class="hover:bg-muted focus-visible:bg-muted flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              aria-label={`${addressDivisionName(option, getLocaleKey())} ${labels[option.class]}`}
              onclick={() => choose(option)}
            >
              <span>{addressDivisionName(option, getLocaleKey())}</span
              ><span class="text-muted-foreground text-xs">{labels[option.class]}</span>
            </button>
          {:else}
            <p class="text-muted-foreground px-3 py-2 text-sm">
              {m.address_locality_no_results()}
            </p>
          {/each}
        </fieldset>
      {/if}
    </div>
  {:else if !paths.length}
    <button
      type="button"
      class="text-primary min-h-9 text-sm hover:underline"
      onclick={() => open()}
    >
      {m.address_neighbourhood_choose()}
    </button>
  {/if}
</div>
