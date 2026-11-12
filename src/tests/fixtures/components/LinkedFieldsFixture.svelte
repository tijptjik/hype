<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import {
  LinkedFields,
  provideLinkedFields,
  type LinkedField,
  type LinkedFieldMode,
} from '#lib/bits/patterns/forms/linkedFields/linkedFields.svelte.js'
// COMPONENTS
import LocationCommunications from '#lib/bits/patterns/forms/featureLocation/LocationCommunications.svelte'
import type { LocationProfileEdit } from '#lib/locations/profileEdit.js'
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'

import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
import LocationBrandEditor from '#lib/bits/patterns/forms/featureLocation/LocationBrandEditor.svelte'
// DOMAIN
import {
  emptyFeatureAddress,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
setResponsiveCtx()
let modes = $state<Record<LinkedField, LinkedFieldMode>>({
  names: 'community',
  phoneNumber: 'community',
  websites: 'community',
  socials: 'internal',
  brands: 'internal',
  location: 'community',
})
let editing = $state(true)
let manual = $state(false)
provideLinkedFields(
  new LinkedFields(
    () => editing,
    () => !manual,
    field => modes[field],
    (field, mode) => (modes[field] = mode),
  ),
)
let names = $state({ en: 'Sample establishment' })
let address = $state<FeatureAddress>({
  ...emptyFeatureAddress(),
  overrides: { en: { streetName: 'Sample Street', buildingNumberExpression: '12' } },
})
let brandEdit = $state<unknown>()
let contacts = $state<LocationProfileEdit['values']>({
  phoneNumber: [],
  websites: [],
  socials: {},
})
let mobility = $state<AccessibilityDraft | undefined>({})
</script>
<main class="bits-theme bg-panel text-foreground mx-auto max-w-5xl p-4">
  <button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
  <button
    type="button"
    onclick={() => {
      manual = !manual
      modes.names = 'internal'
    }}
  >
    Toggle manual
  </button>
  {#snippet identityFields(translations: boolean)}
    <DraftLocationNameFields
      {names}
      kind="establishment"
      {translations}
      isEditing={editing}
      onChange={next => (names = next as typeof names)}
    />
    <LocationCommunications
      value={contacts}
      isEditing={editing}
      onChange={value => (contacts = { ...contacts, ...value })}
    />
    <div class="col-span-6">
      <LocationBrandEditor
        inline
        association={{
          version: 'fixture',
          brandMode: 'inherit',
          effective: { brands: [{ identifiers: {}, names: { en: 'Sample brand' } }] },
        }}
        edit={brandEdit}
        isEditing={editing}
        onChange={next => (brandEdit = next)}
      />
    </div>
  {/snippet}
  <AddressDetails
    {address}
    {identityFields}
    accessibilityDraft={mobility}
    onAccessibilityDraftChange={value => (mobility = value)}
    locationKind="establishment"
    isEditing={editing}
    onChange={next => (address = next)}
  />
  <output data-brand-edit class="sr-only">{JSON.stringify(brandEdit)}</output>
  <output data-profile-values class="sr-only"
    >{JSON.stringify({ contacts, mobility })}</output
  >
  <output data-modes class="sr-only">{JSON.stringify(modes)}</output>
</main>
