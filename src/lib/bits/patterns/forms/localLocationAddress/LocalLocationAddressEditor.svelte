<script lang="ts">
// COMPONENTS
import LocationLifecycleFields from './LocationLifecycleFields.svelte'
import LocalLocationAddressFields from './LocalLocationAddressFields.svelte'
import { Button } from '#lib/bits/core/index.js'
// API
import { saveLocalLocationAddress } from '#lib/api/locationDirectory.remote.js'
// DOMAIN
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { LocationLifecycleSummary } from '#lib/locations/lifecycle.js'
import type { LocationResource } from '#lib/locations/resource.js'

let { place, onSaved }: { place: LocationResource; onSaved: () => Promise<void> } =
  $props()
let value = $state(createLocalLocationAddress())
let expectedRevisionId = $state('')
let expectedOrganisationRevision = $state<string | null>(null)
let lifecycle = $state<LocationLifecycleSummary>({})
let successorLocationId = $state<string | null>(null)
let parseSource = $state<Record<string, string> | undefined>()
let editing = $state(false)
let busy = $state(false)
let failed = $state(false)
let saved = $state(false)
/** Capture a revision alongside the editable copy so concurrent edits cannot be overwritten. */
function edit(): void {
  if (!place.facts || !place.revisionId) return
  value = structuredClone(
    place.facts.location.address.authored ??
      createLocalLocationAddress(place.facts.location.address.fallbackDisplay),
  )
  lifecycle = {
    operatingStatus: place.facts.operatingStatus ?? null,
    buildingStatus: place.facts.buildingStatus ?? null,
  }
  successorLocationId = place.facts.successorLocationId ?? null
  parseSource = undefined
  expectedRevisionId = place.revisionId
  expectedOrganisationRevision = place.organisationRevision ?? null
  editing = true
  saved = failed = false
}
/** Save a new Location revision; linked Features retain their independent adoption decisions. */
async function save(): Promise<void> {
  if (busy) return
  busy = true
  failed = false
  try {
    await saveLocalLocationAddress({
      locationId: place.id,
      expectedRevisionId,
      organisationId: place.editingOrganisationId ?? undefined,
      expectedOrganisationRevision,
      ...lifecycle,
      successorLocationId,
      address: value,
      parseSource,
    })
    editing = false
    saved = true
    await onSaved()
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

{#if place.canEditAddress && place.state !== 'redirect' && place.facts}
  <div class="space-y-3">
    <LocationLifecycleFields
      value={editing ? lifecycle : place.facts}
      successorLocationId={editing
        ? successorLocationId
        : place.facts.successorLocationId}
      kind={place.kind}
      isEditing={editing}
      disabled={busy}
      onChange={next => (lifecycle = next)}
      onSuccessorChange={next => (successorLocationId = next)}
    />
    {#if editing}
      <LocalLocationAddressFields
        bind:value
        disabled={busy}
        onParsed={source => {
          parseSource = source
        }}
      />
      <Button text={m.location_address_save()} disabled={busy} onClick={save} />
    {:else}
      <Button text={m.location_address_edit()} onClick={edit} />
    {/if}
    {#if saved}
      <p role="status" class="text-sm text-muted-foreground">
        {m.location_address_saved()}
      </p>
    {/if}
    {#if failed}
      <p role="alert" class="text-sm text-destructive">{m.location_address_failed()}</p>
    {/if}
  </div>
{/if}
