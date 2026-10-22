<script lang="ts">
// SVELTE
import { onDestroy, tick, untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// ICONS
import BackIcon from 'virtual:icons/lucide/arrow-left'
import SearchIcon from 'virtual:icons/lucide/search'
// API
import { searchDraftLocations } from '#lib/api/draftLocation.remote.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
// I18N
import { getLocale, getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

const searchKinds = ['establishment', 'building', 'address'] as const

type Result = {
  id: string
  kind: 'establishment' | 'address'
  names: Record<string, string>
  address: FeatureAddress
}
let {
  active,
  focusRequest,
  onSelect,
  onBack,
  onMapCandidates,
  onDropPin,
  hasPin = false,
  children,
}: {
  active: boolean
  focusRequest: number
  onSelect: (result: Result) => void
  onBack?: () => void
  onMapCandidates?: (
    markers: import('#lib/locations/searchPresentation.js').LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  onDropPin?: () => void
  hasPin?: boolean
  children?: Snippet<[Snippet, Snippet]>
} = $props()
let input: HTMLInputElement | undefined = $state()
let query = $state('')
let includeShops = $state(true)
let includeAddresses = $state(true)
const hasSearchTypes = $derived(includeShops || includeAddresses)
let selected = $state<Result | null>(null)
let previousRows: Result[] = []
let previousQuery = ''
let rows = $state.raw<Result[]>([])
let loading = $state(false)
let placesFailed = $state(false)
let placesPartial = $state(false)
let placesLimited = $state(false)
let addressesFailed = $state(false)
let hovered = $state<string | null>(null)
let searched = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined
let version = 0
let addressController: AbortController | undefined
$effect(() => {
  if (active && focusRequest && input) void tick().then(() => input?.focus())
})
/** Debounce typed search and invalidate older responses immediately.
 * @returns Nothing.
 */
function schedule(): void {
  clearTimeout(timer)
  selected = null
  version++
  addressController?.abort()
  rows = []
  placesFailed = false
  placesPartial = false
  placesLimited = false
  addressesFailed = false
  searched = false
  loading = Boolean(query.trim()) && hasSearchTypes
  if (query.trim() && hasSearchTypes) timer = setTimeout(() => void search(), 300)
}
/** Search Places and building/address evidence independently, retaining partial results.
 * @returns Completion of the latest read-only search.
 */
async function search(): Promise<void> {
  const request = ++version
  const q = query.trim()
  if (!q || !hasSearchTypes) {
    loading = false
    return
  }
  loading = true
  addressController?.abort()
  addressController = new AbortController()
  rows = []
  placesFailed = false
  placesPartial = false
  placesLimited = false
  addressesFailed = false
  searched = false
  let pending = Number(includeShops) + Number(includeAddresses)
  // Publish each provider immediately; a slow provider must not hide usable results.
  const finish = (): void => {
    if (request !== version) return
    pending--
    loading = pending > 0
    searched = true
  }
  await Promise.allSettled([
    includeShops
      ? Promise.resolve(searchDraftLocations({ q, locale: getLocale(), limit: 5 }))
          .then(places => {
            if (request !== version) return
            placesPartial = places.partial
            placesLimited = 'limited' in places && places.limited === true
            rows = [
              ...rows,
              ...places.rows.map(place => ({
                id: `place:${place.id}`,
                kind: 'establishment' as const,
                names: place.facts.names,
                address: {
                  version: 1 as const,
                  source: place.facts.location.address,
                  coordinates: place.facts.location.geometry.coordinates,
                  matchStatus: place.facts.location.address.status,
                  overrides: {},
                },
              })),
            ]
          })
          .catch(() => {
            if (request === version) placesFailed = true
          })
          .finally(finish)
      : Promise.resolve(),
    includeAddresses
      ? geocodeAddressCandidates({ address: q }, { signal: addressController.signal })
          .then(addresses => {
            if (request !== version) return
            rows = [
              ...rows,
              ...addresses.flatMap(result => {
                const address = result.addressMeta.address
                if (!address) return []
                return [
                  {
                    id: `address:${address.source.address2dId || getAddressDisplay(address, getLocaleKey())}:${address.coordinates?.join(',') || ''}`,
                    kind: 'address' as const,
                    address,
                    names: Object.fromEntries(
                      Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => {
                        const values = getAddressLocale(
                          address,
                          locale as keyof typeof ADDRESS_LOCALES,
                        )
                        return [
                          tag,
                          [values.buildingName, values.premisesName].find(
                            (value): value is string =>
                              typeof value === 'string' && Boolean(value),
                          ) || '',
                        ]
                      }),
                    ),
                  },
                ]
              }),
            ]
          })
          .catch(() => {
            if (request === version) addressesFailed = true
          })
          .finally(finish)
      : Promise.resolve(),
  ])
}
/** Highlight previews without changing the draft's accepted marker.
 * @returns Nothing.
 */
function publishMarkers(): void {
  const markers = rows.flatMap((result, index) =>
    result.address.coordinates
      ? [
          {
            id: result.id,
            kind: result.kind,
            number: index + 1,
            coordinates: result.address.coordinates,
            label:
              result.names[getLocale()] ||
              result.names.en ||
              Object.values(result.names).find(value => value?.trim()) ||
              getAddressDisplay(result.address, getLocaleKey()),
            highlighted: hovered === result.id,
          },
        ]
      : [],
  )
  untrack(() =>
    onMapCandidates?.(markers, id => {
      const result = rows.find(row => row.id === id)
      if (result) choose(result)
    }),
  )
}
$effect(publishMarkers)

/** Accept only an explicitly chosen result, then remove transient map previews.
 * @param result Selected row. @returns Nothing.
 */
function choose(result: Result): void {
  version++
  addressController?.abort()
  clearTimeout(timer)
  loading = false
  searched = false
  previousRows = rows
  previousQuery = query
  selected = result
  rows = []
  onSelect(result)
}
/** Restore the last result set and let the owner undo only the selected Location.
 * @returns Nothing; no new request is needed to recover the previous choices.
 */
function backToResults(): void {
  version++
  addressController?.abort()
  clearTimeout(timer)
  onBack?.()
  selected = null
  query = previousQuery
  rows = previousRows
  searched = true
  loading = false
  void tick().then(() => input?.focus())
}

/** Separate the primary name from its address without repeating the same line.
 * @param result Source candidate. @returns Primary and secondary display labels.
 */
function resultLabels(result: Result): { title: string; detail: string } {
  const display = getAddressDisplay(result.address, getLocaleKey())
  const name =
    result.names[getLocale()]?.trim() ||
    result.names.en?.trim() ||
    Object.values(result.names).find(value => value?.trim()) ||
    ''
  const title =
    name ||
    display.split(/[,，]/)[0] ||
    display ||
    (result.kind === 'address'
      ? m.location_type_address()
      : m.location_type_establishment())
  const detail = display.startsWith(title)
    ? display.slice(title.length).replace(/^[,，\s]+/, '')
    : display
  return { title, detail }
}
onDestroy(() => {
  version++
  addressController?.abort()
  clearTimeout(timer)
})
</script>
{#snippet searchControl()}
  {#if selected}
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onclick={backToResults}
        class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-panel px-3 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <BackIcon class="size-4" aria-hidden="true" />
        {m.feature_start_back_results()}
      </button>
      <LocationIcon
        kind={selected.kind}
        class="size-5 shrink-0 text-muted-foreground"
      />
      <span class="truncate font-medium">{resultLabels(selected).title}</span>
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      <fieldset
        class="flex shrink-0 items-center gap-2"
        aria-label={m.feature_search_include()}
      >
        <legend class="sr-only">{m.feature_search_include()}</legend>
        <span class="text-sm text-muted-foreground" aria-hidden="true"
          >{m.feature_search_include()}</span
        >
        <div
          class="inline-flex items-center gap-1 rounded-lg border border-border bg-panel p-1"
        >
          {#each searchKinds as kind}
            {@const enabled =
              kind === 'establishment'
                ? includeShops
                : kind === 'address'
                  ? includeAddresses
                  : false}
            {@const label =
              kind === 'establishment'
                ? m.feature_search_shops()
                : kind === 'building'
                  ? m.location_type_building()
                  : m.location_type_address()}
            <button
              type="button"
              aria-label={label}
              aria-pressed={enabled}
              title={kind === 'building'
                ? m.feature_search_buildings_unavailable()
                : label}
              disabled={kind === 'building'}
              onclick={() => {
                if (kind === 'establishment') includeShops = !includeShops
                if (kind === 'address') includeAddresses = !includeAddresses
                schedule()
              }}
              class="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-content focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <LocationIcon {kind} class="size-5" />
            </button>
          {/each}
        </div>
      </fieldset>
      <div class="flex min-w-64 flex-1 items-center gap-3">
        <div class="relative min-w-0 flex-1">
          <input
            bind:this={input}
            bind:value={query}
            oninput={schedule}
            maxlength="200"
            aria-label={m.feature_start_search()}
            placeholder={m.feature_start_search()}
            class="w-full min-w-0 rounded-lg border border-border bg-panel py-3 pr-12 pl-4 text-foreground outline-none focus:ring-2 focus:ring-primary"
            onkeydown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                clearTimeout(timer)
                void search()
              }
            }}
          >
          <button
            type="button"
            aria-label={m.feature_search_submit()}
            title={m.feature_search_submit()}
            disabled={!query.trim() || !hasSearchTypes}
            onclick={() => {
              clearTimeout(timer)
              void search()
            }}
            class="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
          >
            <SearchIcon class="size-5" aria-hidden="true" />
          </button>
        </div>
        {#if !hasPin && onDropPin}
          <button
            type="button"
            class="shrink-0 rounded-lg border border-border bg-panel px-4 py-3 text-sm"
            onclick={onDropPin}
          >
            {m.feature_start_drop_pin()}
          </button>
        {/if}
      </div>
    </div>
    {#if !hasSearchTypes}
      <p role="status" class="mt-2 text-sm text-muted-foreground">
        {m.feature_search_select_types()}
      </p>
    {/if}
  {/if}
{/snippet}
{#snippet searchResults()}
  {#if loading || searched || rows.length}
    <div class="border-b border-border px-6 py-2" aria-busy={loading}>
      {#if loading && !rows.length}
        <div
          role="status"
          aria-label={m.resource_loading()}
          class="space-y-3 py-3 motion-safe:animate-pulse"
        >
          {#each [0, 1, 2] as placeholder (placeholder)}
            <div aria-hidden="true" class="flex h-12 items-center gap-3">
              <div class="size-6 rounded-full bg-muted"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-2/3 rounded bg-muted"></div>
                <div class="h-3 w-1/2 rounded bg-muted"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if placesFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_places_failed()}</p>
      {/if}
      {#if placesPartial && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_partial()}</p>
      {/if}
      {#if placesLimited && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_places_limited()}</p>
      {/if}
      {#if addressesFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_addresses_failed()}</p>
      {/if}
      <section
        class="max-h-100 overflow-y-auto overscroll-contain"
        aria-label={m.feature_start_search()}
      >
        {#each rows as result, index (result.id)}
          {@const labels = resultLabels(result)}
          <div animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
            <button
              type="button"
              class="group flex min-h-20 w-full items-center gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors last:border-0 hover:bg-muted focus:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              data-result-id={result.id}
              data-result-number={index + 1}
              data-result-kind={result.kind}
              onmouseenter={() => (hovered = result.id)}
              onmouseleave={() => (hovered = null)}
              onfocus={() => (hovered = result.id)}
              onblur={() => (hovered = null)}
              onclick={() => choose(result)}
            >
              <span
                class={result.kind === 'address'
                  ? 'flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-amber-500 font-bold text-black shadow-sm dark:bg-amber-400'
                  : 'flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-primary font-bold text-primary-content shadow-sm'}
                >{index + 1}</span
              >
              <LocationIcon
                kind={result.kind}
                class="size-5 shrink-0 text-muted-foreground"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-foreground"
                  >{labels.title}</span
                >
                {#if labels.detail}
                  <span class="mt-1 block truncate text-sm text-muted-foreground"
                    >{labels.detail}</span
                  >
                {/if}
              </span>
              <span
                class="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground"
                >{result.kind === 'address'
                  ? m.location_type_address()
                  : m.location_type_establishment()}</span
              >
            </button>
          </div>
        {/each}
      </section>
      {#if searched && !loading && !rows.length && !placesFailed && !placesPartial && !addressesFailed}
        <p class="py-3 text-sm">{m.feature_start_empty()}</p>
      {/if}
      {#if searched && (placesFailed || placesPartial || addressesFailed)}
        <button
          type="button"
          class="py-2 text-sm underline"
          onclick={() => void search()}
        >
          {m.feature_start_retry()}
        </button>
      {/if}
    </div>
  {/if}
{/snippet}
{#if children}
  {@render children(searchControl, searchResults)}
{:else}
  {@render searchControl()}{@render searchResults()}
{/if}
