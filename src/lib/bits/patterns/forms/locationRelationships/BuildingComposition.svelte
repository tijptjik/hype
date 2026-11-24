<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { onDestroy } from 'svelte'
// API
import {
  attachPhysicalBuildingMember,
  getBuildingCompositionRole,
} from '#lib/api/buildingEvidence.remote.js'
// DOMAIN
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
import {
  searchBuildingNamesPage,
  type BuildingSearchResult,
} from '#lib/locations/buildingSearch.js'
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
import { buildingSourceHref } from '#lib/locations/buildingSource.js'
import { getLocaleKey } from '#lib/i18n.js'
let {
  locationId,
  organisationId,
  onSaved,
}: { locationId: string; organisationId: string; onSaved: () => Promise<void> } =
  $props()
const role = $derived(getBuildingCompositionRole({ locationId, organisationId }))
let open = $state(false)
let query = $state('')
let rows = $state<BuildingSearchResult[]>([])
const candidates = $derived.by(() => {
  const result = new Map<string, { row: BuildingSearchResult; labels: Set<string> }>()
  for (const row of rows) {
    const group = result.get(row.buildingSource.id) ?? {
      row,
      labels: new Set<string>(),
    }
    const address = getAddressDisplay(row.address, getLocaleKey())
    if (address) group.labels.add(address)
    result.set(row.buildingSource.id, group)
  }
  return [...result.values()]
})
let cursor = $state<string | null>(null)
let searched = $state(false)
let busy = $state(false)
let failure = $state('')
let generation = 0
const requestId = crypto.randomUUID()
const control = 'border-border rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
/** Find published Building IDs, retaining all pages for the active search.
 * @param more Continue the current query. @returns Once matching footprints are visible.
 */
async function search(more = false): Promise<void> {
  const sequence = ++generation
  busy = true
  failure = ''
  if (!more) {
    rows = []
    cursor = null
  }
  try {
    const result = await searchBuildingNamesPage(
      query.trim(),
      getLocaleKey(),
      () => sequence === generation,
      more ? (cursor ?? undefined) : undefined,
    )
    if (sequence !== generation) return
    rows = [...(more ? rows : []), ...result.rows]
    cursor = result.nextCursor
    searched = true
  } catch (e) {
    if (sequence === generation) failure = e instanceof Error ? e.message : String(e)
  } finally {
    if (sequence === generation) busy = false
  }
}
/** Persist the reviewed child, then open or refresh its physical parent.
 * @param row Selected published Building, or the current imported Building on creation.
 * @returns Once identity, relationship and presentation have refreshed.
 */
async function save(row?: BuildingSearchResult): Promise<void> {
  if (busy) return
  busy = true
  failure = ''
  try {
    const parent = await attachPhysicalBuildingMember({
      organisationId,
      target: row ? { parentId: locationId } : { requestId },
      source: row ? row.buildingSource : { importedLocationId: locationId },
    })
    if (row) {
      await onSaved()
      open = false
    } else
      await goto(
        '/admin/locations/' +
          encodeURIComponent(parent.locationId) +
          '?organisation=' +
          encodeURIComponent(organisationId) +
          '&edit=true#relationships',
        { invalidateAll: true },
      )
  } catch (e) {
    failure = submissionErrorMessage(e) ?? 'Could not save the physical building.'
  } finally {
    busy = false
  }
}
onDestroy(() => {
  generation++
})
</script>
{#if role.current === 'source'}
  <button type="button" class={control} disabled={busy} onclick={() => save()}>
    Create Physical Building
  </button>
{:else if role.current === 'parent'}
  <button
    type="button"
    class={control}
    disabled={busy}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    Add constituent building
  </button>
  {#if open}
    <section aria-label="Constituent building search" class="space-y-3 py-3">
      <label class="grid gap-1 text-sm"
        >Search SaanSeoi buildings by name or address
        <input
          class={control}
          bind:value={query}
          maxlength={200}
          disabled={busy}
          oninput={() => {
            rows = []
            cursor = null
            searched = false
          }}
          onkeydown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (query.trim() && !busy) void search()
            }
          }}
        >
      </label>
      <button
        type="button"
        class={control}
        disabled={busy || !query.trim()}
        onclick={() => search()}
      >
        Search buildings
      </button>
      {#if busy}
        <div
          role="status"
          aria-label="Updating buildings"
          class="bg-muted h-12 animate-pulse rounded-lg"
        ></div>
      {/if}
      {#each candidates as candidate (candidate.row.buildingSource.id)}
        {@const row = candidate.row}
        <div
          class="border-border flex flex-wrap items-center justify-between gap-3 border-b py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="break-words">
              {[row.names.en, ...candidate.labels].filter(Boolean).join(' · ') ||
                'Unnamed building'}
            </p>
            <a
              class="text-muted-foreground text-xs break-all underline"
              href={buildingSourceHref(row.buildingSource)}
              target="_blank"
              rel="noreferrer"
              >SaanSeoi Building · {row.buildingSource.id}</a
            >
          </div>
          <button
            type="button"
            class={control}
            disabled={busy}
            onclick={() => save(row)}
          >
            Add to Physical Building
          </button>
        </div>
      {:else}
        {#if searched && !busy}
          <p>No matching buildings.</p>
        {/if}
      {/each}
      {#if cursor}
        <button
          type="button"
          class={control}
          disabled={busy}
          onclick={() => search(true)}
        >
          More buildings
        </button>
      {/if}
    </section>
  {/if}
{/if}
{#if failure}
  <p role="alert" class="text-error text-sm">{failure}</p>
{/if}
