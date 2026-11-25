<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { onDestroy, untrack } from 'svelte'
// API
import {
  attachPhysicalBuildingMember,
  useAsPhysicalBuilding,
  getBuildingCompositionRole,
  refreshPhysicalBuildingProfile,
} from '#lib/api/buildingEvidence.remote.js'
// COMPONENTS
import BuildingAddressLinks from './BuildingAddressLinks.svelte'
import PhysicalParentPicker from './PhysicalParentPicker.svelte'
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
  previewTerms,
  continueAdding,
  onSaved,
  onAddressesSaved,
}: {
  locationId: string
  organisationId: string
  continueAdding: boolean
  previewTerms: string[]
  onSaved: (adding?: boolean) => Promise<void>
  onAddressesSaved: () => Promise<void>
} = $props()
const role = $derived(getBuildingCompositionRole({ locationId, organisationId }))
let mode = $state<'preview' | 'add' | null>(
  untrack(() => continueAdding || page.url.searchParams.get('constituents') === 'add')
    ? 'add'
    : null,
)
let placing = $state(false)
let reviewingAddresses = $state<string | null>(null)
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
    reviewingAddresses = null
    rows = []
    cursor = null
  }
  try {
    const result = await searchBuildingNamesPage(
      mode === 'preview' ? previewTerms : query.trim(),
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
 * @param parentId Existing physical building chosen for the current import.
 * @returns Once identity, relationship and presentation have refreshed.
 */
async function save(row?: BuildingSearchResult, parentId?: string): Promise<void> {
  if (busy) return
  busy = true
  failure = ''
  try {
    const parent = await attachPhysicalBuildingMember({
      organisationId,
      target: row || parentId ? { parentId: parentId ?? locationId } : { requestId },
      source: row ? row.buildingSource : { importedLocationId: locationId },
    })
    if (row) {
      await role.refresh()
      await onSaved(true)
    } else
      await goto(
        '/admin/locations/' +
          encodeURIComponent(parent.locationId) +
          '?organisation=' +
          encodeURIComponent(organisationId) +
          '&edit=true&constituents=add#relationships',
        { invalidateAll: true },
      )
  } catch (e) {
    failure = submissionErrorMessage(e) ?? 'Could not save the physical building.'
  } finally {
    busy = false
  }
}
/** Toggle a read-only preview or open the manual constituent search.
 * @param next Requested panel. @returns Once the preview results are visible.
 */
async function toggleSearch(next: 'add' | 'preview'): Promise<void> {
  mode = mode === next ? null : next
  reviewingAddresses = null
  rows = []
  cursor = null
  searched = false
  failure = ''
  if (mode === 'preview') await search()
}

/** Retain the current Location as the parent and reveal its constituent controls.
 * @returns Once the durable role and its actions have refreshed.
 */
async function designate(): Promise<void> {
  busy = true
  failure = ''
  try {
    await useAsPhysicalBuilding({ locationId, organisationId })
    await role.refresh()
    placing = false
    mode = 'add'
    await onSaved(true)
  } catch (e) {
    failure = submissionErrorMessage(e) ?? 'Could not designate this building.'
  } finally {
    busy = false
  }
}
/** Fill legacy profile defaults from the existing memberships without adding a child. */
async function fillProfile(): Promise<void> {
  busy = true
  failure = ''
  try {
    await refreshPhysicalBuildingProfile({ locationId, organisationId })
    await onSaved()
  } catch (e) {
    failure = submissionErrorMessage(e) ?? 'Could not populate the building profile.'
  } finally {
    busy = false
  }
}
onDestroy(() => {
  generation++
})
</script>
{#if role.current?.role}
  <div class="flex flex-wrap gap-2">
    <button
      type="button"
      class={control}
      disabled={busy || !previewTerms.length}
      aria-expanded={mode === 'preview'}
      onclick={() => toggleSearch('preview')}
    >
      Preview matches
    </button>
    {#if role.current.role === 'source'}
      <button type="button" class={control} disabled={busy} onclick={() => save()}>
        Create Physical Building
      </button>
      <button
        type="button"
        class={control}
        disabled={busy}
        aria-expanded={placing}
        onclick={() => (placing = !placing)}
      >
        Place in physical building
      </button>
      {#if role.current.canDesignate}
        <button type="button" class={control} disabled={busy} onclick={designate}>
          Use as physical building
        </button>
      {/if}
    {:else}
      <button
        type="button"
        class={control}
        disabled={busy}
        aria-expanded={mode === 'add'}
        onclick={() => toggleSearch('add')}
      >
        Add constituent building
      </button>
      {#if role.current.members.length && role.current.canFillProfile}
        <button type="button" class={control} disabled={busy} onclick={fillProfile}>
          Fill profile from constituents
        </button>
      {/if}
    {/if}
  </div>
  {#if placing && role.current.role === 'source'}
    <PhysicalParentPicker
      {locationId}
      {organisationId}
      {busy}
      onPlace={id => save(undefined, id)}
    />
  {/if}
  {#if mode === 'preview' || (mode === 'add' && role.current.role === 'parent')}
    <section
      aria-label={mode === 'preview'
        ? 'Building match preview'
        : 'Constituent building search'}
      class="space-y-3 py-3"
    >
      {#if mode === 'preview'}
        <p class="text-muted-foreground text-sm">
          SaanSeoi matches for {previewTerms.join(' · ')}
        </p>
      {:else}
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
      {/if}
      {#if busy}
        <div
          role="status"
          aria-label="Updating buildings"
          class="bg-muted h-12 animate-pulse rounded-lg"
        ></div>
      {/if}
      {#each candidates as candidate (candidate.row.buildingSource.id)}
        {@const row = candidate.row}
        {@const attached = role.current?.members.find(
          member => member.id === row.buildingSource.id,
        )}
        <div
          class="border-border flex flex-wrap items-center justify-between gap-3 border-b py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="break-words">
              {[row.names.en || Object.values(row.names)[0], ...candidate.labels]
                .filter(Boolean)
                .join(' · ') || 'Unnamed building'}
            </p>
            <a
              class="text-muted-foreground text-xs break-all underline"
              href={buildingSourceHref(row.buildingSource)}
              target="_blank"
              rel="noreferrer"
              >SaanSeoi Building · {row.buildingSource.id}</a
            >
          </div>
          {#if row.buildingSource.id === role.current?.sourceId}
            <span class="text-muted-foreground text-sm">Current building</span>
          {:else if mode === 'add'}
            {#if attached}
              <span class="text-muted-foreground text-sm">
                Constituent added{attached.outlineRole
                  ? ` · ${attached.outlineRole}`
                  : ''}
              </span>
              {#if row.buildingSource.addressId}
                <button
                  type="button"
                  class={control}
                  aria-expanded={reviewingAddresses === attached.id}
                  onclick={() =>
                    (reviewingAddresses =
                      reviewingAddresses === attached.id ? null : attached.id)}
                >
                  Link addresses to physical building
                </button>
              {/if}
            {:else}
              <button
                type="button"
                class={control}
                disabled={busy}
                onclick={() => save(row)}
              >
                Add to Physical Building
              </button>
            {/if}
          {:else if attached}
            <span class="text-muted-foreground text-sm">Constituent added</span>
          {/if}
        </div>
        {#if mode === 'add' && attached && reviewingAddresses === attached.id}
          <BuildingAddressLinks
            {locationId}
            {organisationId}
            constituentId={attached.id}
            onSaved={onAddressesSaved}
            onCancel={() => (reviewingAddresses = null)}
          />
        {/if}
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
