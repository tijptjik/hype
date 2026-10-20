<script lang="ts">
// COMPONENTS
import LocalPlaceAddressFields from './LocalPlaceAddressFields.svelte'
import { Button } from '#lib/bits/core/index.js'
// API
import { saveLocalPlaceAddress } from '#lib/api/placeDirectory.remote.js'
// DOMAIN
import { createLocalPlaceAddress } from '#lib/addresses/localPlaceAddress.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { PlaceResource } from '#lib/places/resource.js'

let { place, onSaved }: { place: PlaceResource; onSaved: () => Promise<void> } =
  $props()
let value = $state(createLocalPlaceAddress())
let expectedRevisionId = $state('')
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
      createLocalPlaceAddress(place.facts.location.address.fallbackDisplay),
  )
  parseSource = undefined
  expectedRevisionId = place.revisionId
  editing = true
  saved = failed = false
}
/** Save a new Place revision; linked Features retain their independent adoption decisions. */
async function save(): Promise<void> {
  if (busy) return
  busy = true
  failed = false
  try {
    await saveLocalPlaceAddress({
      placeId: place.id,
      expectedRevisionId,
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
    {#if editing}
      <LocalPlaceAddressFields
        bind:value
        disabled={busy}
        onParsed={source => {
          parseSource = source
        }}
      />
      <Button text={m.place_address_save()} disabled={busy} onClick={save} />
    {:else}
      <Button text={m.place_address_edit()} onClick={edit} />
    {/if}
    {#if saved}
      <p role="status" class="text-sm text-muted-foreground">
        {m.place_address_saved()}
      </p>
    {/if}
    {#if failed}
      <p role="alert" class="text-sm text-destructive">{m.place_address_failed()}</p>
    {/if}
  </div>
{/if}
