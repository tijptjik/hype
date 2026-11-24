<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
import { canOperateIn } from '#lib/features/locationPolicy.js'
// API
import {
  saveLocationRelationship,
  getRelationshipPage,
  reconcilePlacementPage,
} from '#lib/api/locationRelationships.remote.js'
// BITS
import { Button } from '#lib/bits/core/button/index.js'
import { SelectField, TextInput, TextArea } from '#lib/bits/custom/form/index.js'
import RelationshipLocationPicker from './RelationshipLocationPicker.svelte'
// COMPONENTS
import BuildingComposition from './BuildingComposition.svelte'
import BuildingAddressLinks from './BuildingAddressLinks.svelte'
import RelationshipPage from './RelationshipPage.svelte'
import LocationLineage from './LocationLineage.svelte'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import { validKnownDate, type RelationshipInput } from '#lib/locations/relationships.js'

let {
  locationId,
  kind,
  organisationId = null,
  queryScope = '',
  canEdit = false,
  onCompositionSaved,
}: {
  locationId: string
  kind: LocationKind
  organisationId?: string | null
  queryScope?: string
  canEdit?: boolean
  onCompositionSaved?: () => Promise<void>
} = $props()
let refreshVersion = $state(0)
const uid = $props.id()
let adding = $state(false)
let linkingAddresses = $state(false)
let selected = $state<{ id: string; label: string }[]>([])
const targetId = $derived(selected[0]?.id ?? '')
let relation = $state<'locationMembership' | 'locationOccupancy'>('locationMembership')
let relationshipState = $state<'current' | 'former' | 'unconfirmed'>('unconfirmed')
let description = $state('')
let sourceUrl = $state('')
let starts = $state('')
let ends = $state('')
/** Parse an optional boundary without inventing missing months or days.
 * @param value User-entered year, month or day.
 * @returns A validated boundary, null when blank, or undefined when invalid.
 */
function boundary(
  value: string,
): { value: string; precision: 'year' | 'month' | 'day' } | null | undefined {
  if (!value.trim()) return null
  const text = value.trim()
  const precision = text.length === 4 ? 'year' : text.length === 7 ? 'month' : 'day'
  return validKnownDate(text, precision) ? { value: text, precision } : undefined
}
const datesValid = $derived(
  boundary(starts) !== undefined &&
    boundary(ends) !== undefined &&
    (!starts || !ends || starts <= ends),
)
const evidenceValid = $derived(
  (!sourceUrl && !description.trim()) ||
    (/^https?:\/\//.test(sourceUrl) && Boolean(description.trim())),
)
let saving = $state(false)
let failure = $state('')
const canOccupy = $derived(kind === 'establishment' || kind === 'service_point')
const canContain = $derived(
  kind === 'building' || kind === 'building_part' || kind === 'premises',
)

/** Append a new episode or complete correction without modifying a prior assertion.
 * @param previous Existing assertion to correct.
 * @param suppress Hide the assertion in the selected scope.
 * @returns Resolves after saving and reconciling affected placements.
 */
async function save(
  previous?: Record<string, unknown>,
  suppress = false,
): Promise<void> {
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
        : boundary(starts),
      effectiveTo: previous?.effectiveTo
        ? {
            value: String(previous.effectiveTo),
            precision: previous.effectiveToPrecision,
          }
        : boundary(ends),
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
    // Refresh the remote cache before remounting cards so the newly saved assertion is visible.
    await getRelationshipPage({
      locationId,
      organisationId,
      table,
      history: false,
      afterId: undefined,
    }).refresh()
    refreshVersion += 1
    selected = []
    sourceUrl = ''
    description = ''
    starts = ''
    ends = ''
    adding = false
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Could not save relationship'
  } finally {
    saving = false
  }
}
</script>

<section class="space-y-8" aria-label="Location relationships">
  <div class="space-y-2">
    <h3 class="text-base font-semibold">Location relationships</h3>
    <p class="text-muted-foreground max-w-3xl text-sm">
      Manage where this place belongs, where it operates, and how it changed over time.
      Features linked to this place are listed separately in Features.
    </p>
    {#if canEdit}
      <p class="text-muted-foreground text-xs">
        Relationship actions save immediately and retain a version in history. Cancel
        closes an unsaved editor; it does not undo recorded changes.
      </p>
    {/if}
    <p class="text-muted-foreground text-xs">
      {organisationId
        ? 'Changes apply to this organisation’s view.'
        : 'Changes apply to the shared Location record.'}
      Previous versions are retained.
    </p>
  </div>
  {#key locationId + ':' + organisationId + ':' + refreshVersion}
    {#each ['locationMembership', 'locationOccupancy', 'locationAddress'] as table}
      <RelationshipPage
        {locationId}
        showOperatingHosts={canOccupy}
        {organisationId}
        {canEdit}
        table={table as 'locationMembership' | 'locationOccupancy' | 'locationAddress'}
        onSave={save}
        {saving}
      >
        {#snippet actions()}
          {#if canEdit &&
            table === 'locationAddress' &&
            kind === 'building' &&
            !linkingAddresses}
            <Button
              text="Link addresses"
              size="sm"
              style="ghost"
              onClick={() => (linkingAddresses = true)}
            />
          {/if}
          {#if canEdit &&
            ((table === 'locationOccupancy' && canOccupy) ||
              (table === 'locationMembership' && canContain))}
            <Button
              text={adding
                ? 'Cancel'
                : canOccupy
                  ? m.location_operating_period()
                  : 'Add to complex'}
              size="sm"
              style="ghost"
              disabled={saving}
              onClick={() => (adding = !adding)}
            />
          {/if}
        {/snippet}
        {#snippet editor()}
          {#if table === 'locationMembership' &&
            canEdit &&
            organisationId &&
            kind === 'building'}
            <BuildingComposition
              {locationId}
              {organisationId}
              onSaved={async () => {
                await getRelationshipPage({
                  locationId,
                  organisationId,
                  table: 'locationMembership',
                  history: false,
                  afterId: undefined,
                }).refresh()
                await onCompositionSaved?.()
                refreshVersion++
              }}
            />
          {/if}
          {#if canEdit &&
            table === 'locationAddress' &&
            kind === 'building' &&
            linkingAddresses}
            <BuildingAddressLinks
              {locationId}
              {organisationId}
              onCancel={() => (linkingAddresses = false)}
              onSaved={async () => {
                await getRelationshipPage({
                  locationId,
                  organisationId,
                  table: 'locationAddress',
                  history: false,
                  afterId: undefined,
                }).refresh()
                linkingAddresses = false
                refreshVersion++
              }}
            />
          {/if}
          {#if adding &&
            canEdit &&
            ((table === 'locationOccupancy' && canOccupy) ||
              (table === 'locationMembership' && canContain))}
            <fieldset
              disabled={saving}
              class="bg-muted/20 grid min-w-0 gap-6 rounded-xl p-5 md:grid-cols-2"
            >
              <div class="min-w-0 md:col-span-2">
                <RelationshipLocationPicker
                  label={canOccupy ? m.location_operates_in() : 'Containing complex'}
                  {selected}
                  onChange={items => (selected = items)}
                  {organisationId}
                  {queryScope}
                  exclude={[locationId]}
                  accepts={target =>
                    canOccupy
                      ? canOperateIn(kind, target)
                      : kind === 'building_part'
                        ? target === 'building_part'
                        : target === 'premises'}
                  disabled={saving}
                />
              </div>
              <SelectField
                triggerClass="bg-transparent! hover:bg-transparent! shadow-none!"
                id={uid + '-status'}
                label="Relationship status"
                value={relationshipState}
                items={['unconfirmed', 'current', 'former'].map(value => ({
                  value,
                  label: value[0].toUpperCase() + value.slice(1),
                }))}
                onValueChange={value =>
                  (relationshipState = value as typeof relationshipState)}
              />
              <TextInput
                variant="resource"
                id={uid + '-source'}
                name=""
                label="Supporting source URL (optional)"
                inputAttrs={{ inputmode: 'url' }}
                bind:value={sourceUrl}
              />
              <TextInput
                variant="resource"
                id={uid + '-starts'}
                name=""
                label="From (optional)"
                placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
                bind:value={starts}
              />
              <TextInput
                variant="resource"
                id={uid + '-ends'}
                name=""
                label="Until (optional)"
                placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
                bind:value={ends}
              />
              {#if !datesValid}
                <p class="text-destructive text-xs md:col-span-2">
                  Use a valid year, month or date, with the end after the start.
                </p>
              {/if}
              <TextArea
                controlClass="bg-transparent!"
                id={uid + '-description'}
                name=""
                label="What does the source establish?"
                rows={3}
                bind:value={description}
                class="md:col-span-2"
              />
              <p class="text-muted-foreground text-xs md:col-span-2">
                {m.location_operating_help()}
              </p>
              <div class="flex flex-wrap gap-2 md:col-span-2">
                <Button
                  text={saving ? 'Recording…' : 'Record relationship'}
                  color="primary"
                  disabled={saving || !targetId || !evidenceValid || !datesValid}
                  onClick={() => save()}
                />
                <Button
                  text="Cancel"
                  style="ghost"
                  disabled={saving}
                  onClick={() => (adding = false)}
                />
              </div>
            </fieldset>
          {/if}
        {/snippet}
      </RelationshipPage>
    {/each}
    <LocationLineage {locationId} {organisationId} {queryScope} {canEdit} />
  {/key}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
  {/if}
</section>
