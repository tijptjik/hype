<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
// ADDRESS
import {
  emptyFeatureAddress,
  getAddressDisplay,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { setAddressExpression } from '#lib/addresses/addressExpressions.js'
import { setAddressName } from '#lib/addresses/nameCatalogue.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import type { NearbyStreet } from '#lib/map/nearbyStreets.js'
// STYLES
import { formSurfaceStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'

setResponsiveCtx()
let address = $state<FeatureAddress>(
  setAddressExpression(
    setAddressExpression(emptyFeatureAddress(), 'en', 'streetName', 'Hollywood Road'),
    'en',
    'buildingNumberExpression',
    '238',
  ),
)
let accepted = $state(0),
  reviewed = $state(0),
  submissions = $state(0),
  selectedStreet = $state('')
const conflicts = [{ field: 'number' as const, selected: '238', mapped: '238-240' }]
const streets: NearbyStreet[] = [
  {
    street: { id: 'hollywood', name: 'Hollywood Road', names: {}, divisionCodes: [] },
    distance: 4,
  },
  {
    street: {
      id: 'tai-ping-shan',
      names: { en: 'Tai Ping Shan Street', 'zh-Hant': '太平山街' },
      divisionCodes: [],
    },
    distance: 26,
  },
]
</script>

<div class="bits-theme bg-canvas text-foreground min-h-screen p-4">
  <div class="flex flex-wrap items-start gap-4 pb-5">
    <div data-normal-conflict>
      <MapAddressConflict
        {conflicts}
        onAccept={() => accepted++}
        onReview={() => reviewed++}
      />
    </div>
    <div data-ambiguous-conflict>
      <MapAddressConflict
        {conflicts}
        reviewRequired={true}
        error="More than one address matches. Review the change to choose one."
        onAccept={() => accepted++}
        onReview={() => reviewed++}
      />
    </div>
  </div>
  <div class="bits-admin-shell__main">
    <form
      class="overflow-x-auto"
      onsubmit={event => {
        event.preventDefault()
        submissions++
      }}
    >
      <main data-form-surface class={formSurfaceStyles}>
        <FormFeatureAddress
          {address}
          coordinates={[114.148, 22.284]}
          isEditing={true}
          isLoading={false}
          showMap={false}
          showCoordinates={false}
          showDivisions={false}
          showLookup={false}
          streetCandidates={streets}
          onSelectStreet={street => {
            selectedStreet = street.id
            address = setAddressName(address, 'streetName', street)
          }}
          onChange={value => (address = value)}
          onCoordinateChange={() => {}}
          onSelectCandidate={() => {}}
          onLookup={() => {}}
        />
      </main>
      <button type="submit" class="m-4 rounded border px-3 py-2">Save fixture</button>
    </form>
  </div>
  <output class="sr-only" data-display>{getAddressDisplay(address, 'en')}</output>
  <output class="sr-only" data-content
    >{JSON.stringify(localAddressContent(address).i18n.en)}</output
  >
  <output class="sr-only" data-submissions>{submissions}</output>
  <output class="sr-only" data-selected-street>{selectedStreet}</output>
  <output class="sr-only" data-accepted>{accepted}</output>
  <output class="sr-only" data-reviewed>{reviewed}</output>
</div>
