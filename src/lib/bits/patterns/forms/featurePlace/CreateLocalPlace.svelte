<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
// API
import { createLocalPlace, getLocalPlaceCreationAccess } from '#lib/api/place.remote.js'
// DOMAIN
import LocalPlaceAddressFields from '#lib/bits/patterns/forms/localPlaceAddress/LocalPlaceAddressFields.svelte'
import { createLocalPlaceAddress } from '#lib/addresses/localPlaceAddress.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
// TYPES
import type { PlaceFacts } from '#lib/places/model.js'

let {
  projectId,
  coordinates,
  disabled,
  onCreated,
}: {
  projectId: string
  coordinates: number[]
  disabled: boolean
  onCreated: (selection: {
    placeId: string
    revisionId: string
    facts: PlaceFacts
  }) => void
} = $props()
let allowed = $state(false)
let open = $state(false)
// Offer creation only after checking the owning Organisation; writes reauthorize independently.
$effect(() => {
  const access = getLocalPlaceCreationAccess({ projectId })
  let cancelled = false
  allowed = false
  open = false
  void access
    .refresh()
    .then(() => access)
    .then(result => {
      if (!cancelled) allowed = result.allowed
    })
    .catch(() => {
      if (!cancelled) allowed = false
    })
  return () => {
    cancelled = true
  }
})
let name = $state('')
let address = $state(createLocalPlaceAddress())
let parseSource = $state<Record<string, string> | undefined>()
let placeState = $state<'manual' | 'unresolved'>('unresolved')
let busy = $state(false)
let failed = $state(false)
const kinds = $derived([
  { value: 'unresolved', label: m.feature_place_unresolved_kind() },
  { value: 'manual', label: m.feature_place_manual_kind() },
])

/** Create an explicit private baseline, then preview it before the separate link action. */
async function create(): Promise<void> {
  if (!allowed || busy || disabled || !name.trim()) return
  busy = true
  failed = false
  try {
    const key = getLocaleKey()
    const locale = key === 'zhHant' ? 'zh-hant' : key === 'zhHans' ? 'zh-hans' : 'en'
    const input = LocalPlaceInputSchema.parse({
      state: placeState,
      parseSource,
      facts: {
        names: { [locale]: name.trim() },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates },
          address: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            addressSnapshotId: null,
            records: {},
            fallbackDisplay: {},
            authored: address,
          },
        },
      },
    })
    const identity = await createLocalPlace({ projectId, ...input })
    onCreated({ ...identity, facts: input.facts })
    open = false
    name = ''
    address = createLocalPlaceAddress()
    parseSource = undefined
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

{#if allowed}
  <div class="space-y-3 rounded-xl border border-border p-4">
    <Button
      type="button"
      text={m.feature_place_create_local()}
      onClick={() => (open = !open)}
      disabled={busy || disabled}
    />
    {#if open}
      <p class="text-sm text-muted-foreground">{m.feature_place_local_description()}</p>
      <SelectField
        id="local-place-kind"
        label={m.feature_place_kind()}
        value={placeState}
        items={kinds}
        disabled={busy || disabled}
        onValueChange={value => {
          if (value === 'manual' || value === 'unresolved') placeState = value
        }}
      />
      <TextInput
        name=""
        id="local-place-name"
        label={m.feature_place_search_label()}
        bind:value={name}
        inputAttrs={{
          onkeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void create()
            }
          },
        }}
        disabled={busy || disabled}
      />
      <LocalPlaceAddressFields
        bind:value={address}
        disabled={busy || disabled}
        onParsed={source => {
          parseSource = source
        }}
      />
      <p class="text-sm text-muted-foreground">
        {m.feature_place_local_coordinates()} {coordinates.join(', ')}
      </p>
      <Button
        type="button"
        text={m.feature_place_create_preview()}
        onClick={create}
        disabled={busy || disabled || !name.trim()}
      />
      {#if failed}
        <p role="alert" class="text-sm text-destructive">{m.feature_place_failed()}</p>
      {/if}
    {/if}
  </div>
{/if}
