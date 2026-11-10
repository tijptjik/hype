<script lang="ts">
// API
import {
  saveLocationRelationship,
  reconcilePlacementPage,
} from '#lib/api/locationRelationships.remote.js'
import { getLocations } from '#lib/api/locationDirectory.remote.js'
// COMPONENTS
import RelationshipPage from './RelationshipPage.svelte'
import LocationLineage from './LocationLineage.svelte'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import type { RelationshipInput } from '#lib/locations/relationships.js'

let {
  locationId,
  kind,
  organisationId = null,
  queryScope = '',
  canEdit = false,
}: {
  locationId: string
  kind: LocationKind
  organisationId?: string | null
  queryScope?: string
  canEdit?: boolean
} = $props()
let refreshVersion = $state(0)
let search = $state('')
let targetId = $state('')
let relation = $state<'locationMembership' | 'locationOccupancy'>('locationMembership')
let relationshipState = $state<'current' | 'former' | 'unconfirmed'>('unconfirmed')
let description = $state('')
let sourceUrl = $state('')
let saving = $state(false)
let failure = $state('')
const targets = $derived(
  search.trim().length > 1
    ? getLocations({
        q: search.trim(),
        organisationId: organisationId ?? undefined,
        scope: queryScope,
      })
    : null,
)
const canOccupy = $derived(kind === 'establishment')
const canContain = $derived(
  kind === 'building' || kind === 'building_part' || kind === 'premises',
)

/** Append a new episode or a complete correction without modifying a prior assertion. */
async function save(previous?: Record<string, unknown>, suppress = false) {
  failure = ''
  saving = true
  try {
    const id = crypto.randomUUID()
    const table = previous
      ? 'occupancyState' in previous
        ? 'locationOccupancy'
        : 'membershipState' in previous
          ? 'locationMembership'
          : 'locationAddress'
      : canOccupy
        ? 'locationOccupancy'
        : relation
    const common = {
      id,
      table,
      relationshipId: previous ? String(previous.relationshipId) : id,
      previousRevisionId:
        previous?.scopeOrganisationId === organisationId ? String(previous.id) : null,
      scopeOrganisationId: organisationId,
      assertionState: suppress ? ('suppressed' as const) : ('asserted' as const),
      observedAt: null,
      verifiedAt: null,
      effectiveFrom: previous?.effectiveFrom
        ? {
            value: String(previous.effectiveFrom),
            precision: previous.effectiveFromPrecision,
          }
        : null,
      effectiveTo: previous?.effectiveTo
        ? {
            value: String(previous.effectiveTo),
            precision: previous.effectiveToPrecision,
          }
        : null,
      evidence:
        sourceUrl && description
          ? [
              {
                source: {
                  kind: 'url',
                  url: sourceUrl,
                  accessedAt: new Date().toISOString(),
                },
                supports: [
                  table === 'locationOccupancy'
                    ? 'occupancyState'
                    : table === 'locationMembership'
                      ? 'membershipState'
                      : 'addressState',
                ],
                quotedText: null,
                description,
                sourceDate: null,
              },
            ]
          : [],
    }
    const fields =
      table === 'locationOccupancy'
        ? {
            establishmentLocationId: previous?.establishmentLocationId ?? locationId,
            containerLocationId: previous?.containerLocationId ?? targetId,
            addressRevisionId: previous?.addressRevisionId ?? null,
            occupancyState: previous?.occupancyState ?? relationshipState,
          }
        : table === 'locationMembership'
          ? {
              childLocationId: previous?.childLocationId ?? locationId,
              parentLocationId: previous?.parentLocationId ?? targetId,
              membershipState: previous?.membershipState ?? relationshipState,
            }
          : {
              locationId,
              addressRevisionId: previous?.addressRevisionId,
              priority: previous?.priority ?? null,
              addressState: previous?.addressState ?? relationshipState,
            }
    const assertion = { ...common, ...fields } as RelationshipInput
    const saved = await saveLocationRelationship(assertion)
    let cursor = saved.reconciliation?.nextCursor
    while (cursor && assertion.table === 'locationOccupancy') {
      const next = await reconcilePlacementPage({
        locationId: assertion.establishmentLocationId,
        organisationId: assertion.scopeOrganisationId,
        afterFeatureId: cursor,
      })
      cursor = next.nextCursor
    }
    refreshVersion += 1
    targetId = ''
    search = ''
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Could not save relationship'
  } finally {
    saving = false
  }
}
</script>

<section
  class="border-border space-y-4 border-t pt-6"
  aria-label="Location relationships"
>
  <h3 class="text-base font-semibold">Buildings, complexes and occupants</h3>
  <p class="text-muted-foreground text-sm">
    Verified occupancy changes are checked against each Feature’s relocation policy.
    Features either stay here, wait for review, or follow when their address and
    directions need no review.
  </p>
  {#key locationId + ':' + organisationId + ':' + refreshVersion}
    {#each ['locationMembership', 'locationOccupancy', 'locationAddress'] as table}
      <RelationshipPage
        {locationId}
        {organisationId}
        {canEdit}
        table={table as 'locationMembership' | 'locationOccupancy' | 'locationAddress'}
        onSave={save}
        {saving}
      />
    {/each}
    <LocationLineage {locationId} {organisationId} {canEdit} />
  {/key}
  {#if canEdit && (canOccupy || canContain)}
    <details class="space-y-3">
      <summary class="cursor-pointer text-sm font-medium">
        {canOccupy ? 'Record an occupancy episode' : 'Add to complex'}
      </summary>
      <label class="block text-sm"
        >{canOccupy ? 'Building or complex' : 'Containing complex'}
        <input
          class="border-border bg-background mt-1 w-full rounded border p-2"
          bind:value={search}
          placeholder="Search Locations"
        >
      </label>
      {#if targets}
        {#await targets then matches}
          <select
            class="border-border bg-background w-full rounded border p-2"
            bind:value={targetId}
            aria-label="Destination Location"
          >
            <option value="">Select a Location</option>
            {#each matches.data.filter(
              item =>
                item.id !== locationId &&
                (kind === 'building_part'
                  ? item.kind === 'building_part'
                  : item.kind === 'premises' ||
                    (canOccupy &&
                      (item.kind === 'building' || item.kind === 'building_part'))),
            ) as item}
              <option value={item.id}>{item.facts?.names.en ?? item.id}</option>
            {/each}
          </select>
        {/await}
      {/if}
      <label class="block text-sm"
        >Relationship status
        <select
          class="border-border bg-background rounded border p-2"
          bind:value={relationshipState}
        >
          <option value="unconfirmed">Unconfirmed</option>
          <option value="current">Current</option>
          <option value="former">Former</option>
        </select></label
      >
      <label class="block text-sm"
        >Supporting source URL (optional)<input
          class="border-border bg-background mt-1 w-full rounded border p-2"
          type="url"
          bind:value={sourceUrl}
        ></label
      >
      <label class="block text-sm"
        >What does it establish?<textarea
          class="border-border bg-background mt-1 w-full rounded border p-2"
          bind:value={description}
        ></textarea></label
      >
      <button
        type="button"
        class="bg-primary text-primary-foreground rounded px-3 py-2 disabled:opacity-50"
        disabled={saving || !targetId}
        onclick={() => save()}
      >
        Record relationship
      </button>
    </details>
  {/if}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
  {/if}
</section>
