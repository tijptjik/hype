<script lang="ts">
// SVELTE
import { onMount, untrack, tick } from 'svelte'
import { fly } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import CloseIcon from 'virtual:icons/lucide/x'
import FilterIcon from 'virtual:icons/lucide/list-filter'
import SettingsIcon from 'virtual:icons/lucide/settings-2'
import ChevronIcon from 'virtual:icons/lucide/chevron-right'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import {
  placeTaxonomy,
  placeTaxonomyPath,
  type PlaceTaxonomyNode,
} from '#lib/locations/placeTaxonomy.js'
// TYPES
import type { PlaceSearchFilters } from '#lib/locations/placeSearchFilters.js'
let {
  value,
  onApply,
  onClose,
}: {
  value: PlaceSearchFilters
  onApply: (value: PlaceSearchFilters) => void
  onClose: () => void
} = $props()
let draft = $state<PlaceSearchFilters>(untrack(() => ({ ...value })))
let path = $state<PlaceTaxonomyNode[]>(
  untrack(() =>
    placeTaxonomyPath(
      value.taxonomyCategory || value.taxonomyPrimary || value.basicCategory || '',
    ),
  ),
)
let settingsOpen = $state(false)
let search = $state('')
let panel: HTMLElement
let columnsElement: HTMLElement | undefined = $state()
const columns = $derived([
  placeTaxonomy,
  ...path.filter(node => node.children?.length).map(node => node.children!),
])
const matches = $derived.by(() => {
  const query = search.trim().toLowerCase()
  if (!query) return []
  const visit = (nodes: PlaceTaxonomyNode[]): PlaceTaxonomyNode[] =>
    nodes.flatMap(node => [
      ...(node.label.toLowerCase().includes(query) ? [node] : []),
      ...visit(node.children ?? []),
    ])
  return visit(placeTaxonomy)
})
onMount(() => panel.focus())
/** Select one coherent branch, replacing incompatible category/type constraints.
 * @param node Publisher category. @returns Nothing.
 */
function choose(node: PlaceTaxonomyNode): void {
  path = placeTaxonomyPath(node.name)
  draft = {
    operatingStatus: draft.operatingStatus ?? 'open',
    ...(node.children?.length
      ? { taxonomyCategory: node.name }
      : { taxonomyPrimary: node.name }),
  }
  search = ''
  void tick().then(() =>
    columnsElement?.scrollTo({
      left: columnsElement.scrollWidth,
      behavior: prefersReducedMotion.current ? 'instant' : 'smooth',
    }),
  )
}
</script>
<section
  bind:this={panel}
  role="dialog"
  aria-label={m.feature_search_filters()}
  tabindex="-1"
  onkeydown={event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement)
      event.preventDefault()
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }}
  transition:fly={{
    y: prefersReducedMotion.current ? 0 : 36,
    duration: prefersReducedMotion.current ? 0 : 180,
  }}
  class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-xl border border-border bg-panel text-foreground shadow-xl outline-none"
>
  <div
    class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"
  >
    <h3 class="flex items-center gap-2 font-semibold">
      <FilterIcon class="size-4" />{m.feature_search_filters()}
    </h3>
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-label={m.feature_search_status()}
        aria-expanded={settingsOpen}
        onclick={() => (settingsOpen = !settingsOpen)}
        class="rounded-md p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <SettingsIcon class="size-4" />
      </button>
      <button
        type="button"
        onclick={onClose}
        aria-label={m.feature_search_close_filters()}
        class="rounded-md p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <CloseIcon class="size-4" />
      </button>
    </div>
  </div>
  {#if settingsOpen}
    <fieldset class="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-3">
      <legend class="sr-only">{m.feature_search_status()}</legend>
      {#each [
        { value: 'open', label: m.feature_search_operating() },
        { value: 'temporarily_closed', label: m.feature_search_temporarily_closed() },
        { value: 'permanently_closed', label: m.feature_search_permanently_closed() },
        { value: 'any', label: m.feature_search_any() },
      ] as status}
        <label
          class="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          ><input
            type="radio"
            name="place-operating-status"
            value={status.value}
            checked={(draft.operatingStatus ?? 'open') === status.value}
            onchange={() =>
              (draft.operatingStatus =
                status.value as PlaceSearchFilters['operatingStatus'])}
            class="accent-primary"
          >{status.label}</label
        >
      {/each}
      <p class="w-full text-xs text-muted-foreground">
        {m.feature_search_status_help()}
      </p>
    </fieldset>
  {/if}
  <div class="shrink-0 space-y-2 px-4 py-3">
    <input
      bind:value={search}
      aria-label={m.feature_search_category()}
      placeholder={m.feature_search_category_search()}
      class="w-full rounded-lg border border-border bg-panel px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
    >
    <p class="text-xs text-muted-foreground">
      {path.length
        ? path.map(node => node.label).join(' › ')
        : m.feature_search_filter_help()}
    </p>
  </div>
  {#if search.trim()}
    <div
      class="grid min-h-0 flex-1 auto-rows-max grid-cols-2 content-start gap-1 overflow-y-auto px-4 pb-3 md:grid-cols-3"
    >
      {#each matches as node (node.name)}
        <button
          type="button"
          class="rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          onclick={() => choose(node)}
        >
          {node.label}
        </button>
      {/each}
      {#if !matches.length}
        <p class="py-3 text-sm">{m.feature_start_empty()}</p>
      {/if}
    </div>
  {:else}
    <div
      bind:this={columnsElement}
      class="flex min-h-0 flex-1 overflow-x-auto border-t border-border"
    >
      {#each columns as nodes, level}
        <fieldset
          class="h-full min-h-0 min-w-56 flex-1 overflow-y-auto border-r border-border p-2"
          aria-label={`${m.feature_search_category()} ${level + 1}`}
        >
          {#each nodes as node (node.name)}
            <button
              type="button"
              aria-pressed={path[level]?.name === node.name}
              class={[
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                path[level]?.name === node.name && 'bg-primary/15',
              ]}
              class:text-primary={path[level]?.name === node.name}
              onclick={() => choose(node)}
            >
              <span>{node.label}</span>
              {#if node.children?.length}
                <ChevronIcon class="size-4 shrink-0" />
              {/if}
            </button>
          {/each}
        </fieldset>
      {/each}
    </div>
  {/if}
  <div
    class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3"
  >
    <button
      type="button"
      onclick={() => onApply({ operatingStatus: 'open' })}
      class="mr-auto rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
    >
      {m.feature_search_reset_filters()}
    </button>
    <button
      type="button"
      onclick={onClose}
      class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
    >
      {m.feature_search_cancel_filters()}
    </button>
    <button
      type="button"
      onclick={() => onApply(draft)}
      class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-primary"
    >
      {m.feature_search_accept_filters()}
    </button>
  </div>
</section>
