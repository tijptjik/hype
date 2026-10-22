<script lang="ts">
// SVELTE
import { onDestroy, tick, untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
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
  onMapCandidates,
  onDropPin,
  hasPin = false,
  children,
}: {
  active: boolean
  focusRequest: number
  onSelect: (result: Result) => void
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
let rows = $state.raw<Result[]>([])
let loading = $state(false)
let placesFailed = $state(false)
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
  version++
  addressController?.abort()
  rows = []
  placesFailed = false
  addressesFailed = false
  searched = false
  loading = Boolean(query.trim())
  if (query.trim()) timer = setTimeout(() => void search(), 300)
}
/** Search Places and building/address evidence independently, retaining partial results.
 * @returns Completion of the latest read-only search.
 */
async function search(): Promise<void> {
  const request = ++version
  const q = query.trim()
  if (!q) {
    loading = false
    return
  }
  loading = true
  addressController?.abort()
  addressController = new AbortController()
  rows = []
  placesFailed = false
  addressesFailed = false
  searched = false
  let pending = 2
  // Publish each provider immediately; a slow provider must not hide usable results.
  const finish = (): void => {
    if (request !== version) return
    pending--
    loading = pending > 0
    searched = true
  }
  await Promise.allSettled([
    Promise.resolve(searchDraftLocations({ q, locale: getLocale(), limit: 5 }))
      .then(places => {
        if (request !== version) return
        placesFailed = places.partial
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
      .finally(finish),
    geocodeAddressCandidates({ address: q }, { signal: addressController.signal })
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
      .finally(finish),
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
  rows = []
  onSelect(result)
}
onDestroy(() => {
  version++
  addressController?.abort()
  clearTimeout(timer)
})
</script>
{#snippet searchControl()}
  <div class="flex items-center gap-3">
    <input
      bind:this={input}
      bind:value={query}
      oninput={schedule}
      maxlength="200"
      aria-label={m.feature_start_search()}
      placeholder={m.feature_start_search()}
      class="min-w-0 flex-1 rounded-lg border border-border bg-panel px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-primary"
      onkeydown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          clearTimeout(timer)
          void search()
        }
      }}
    >
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
      {#if addressesFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_addresses_failed()}</p>
      {/if}
      <section
        class="max-h-80 overflow-y-auto overscroll-contain"
        aria-label={m.feature_start_search()}
      >
        {#each rows as result, index (result.id)}
          <div animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}>
            <button
              type="button"
              class="flex h-16 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-muted focus:bg-muted"
              onmouseenter={() => (hovered = result.id)}
              onmouseleave={() => (hovered = null)}
              onfocus={() => (hovered = result.id)}
              onblur={() => (hovered = null)}
              onclick={() => choose(result)}
            >
              <span class="shrink-0 text-sm text-muted-foreground">{index + 1}</span>
              <span class="min-w-0">
                <span class="block truncate font-medium"
                  >{result.names[getLocale()] ||
                    result.names.en ||
                    getAddressDisplay(result.address, getLocaleKey())}</span
                >
                <span class="block truncate text-sm text-muted-foreground"
                  >{getAddressDisplay(result.address, getLocaleKey())}</span
                >
              </span>
            </button>
          </div>
        {/each}
      </section>
      {#if searched && !loading && !rows.length && !placesFailed && !addressesFailed}
        <p class="py-3 text-sm">{m.feature_start_empty()}</p>
      {/if}
      {#if searched && (placesFailed || addressesFailed)}
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
