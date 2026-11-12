<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Address from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import Search from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import Profile from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import Issues from '#lib/bits/custom/form/src/sectionHeader/components/SectionHeaderIssues.svelte'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
setResponsiveCtx()
const noCoordinates = location.search.includes('no-coordinates')
const shortMode = location.search.includes('short')
let address = $state({
  ...emptyFeatureAddress(),
  overrides: {
    en: {
      buildingName: shortMode ? 'Whampoa F' : 'Nan Dao Commercial Building',
      buildingNumberExpression: shortMode ? '' : '359-361',
      streetName: shortMode ? '' : "Queen's Road Central",
      townName: shortMode ? 'Hung Hom' : 'Sheung Wan',
    },
  },
})
let coordinates = $state([114.152491234, 22.288801234])
let translations = $state(false)
const locales = restoreProfileLocales(['en'], { en: { title: 'Breadline @ The One' } })
</script>
<main class="bg-panel @container mx-auto max-w-5xl space-y-12">
  <Search
    active={false}
    focusRequest={0}
    initialMode="pin"
    hasPin
    coordinates={[114.14949, 22.28616]}
    onSelect={() => {}}
    onDropPin={() => {}}
  >
    {#snippet children(controls)}
      <section data-search-toolbar>
        <Address
          {address}
          {coordinates}
          locationControl={controls}
          coordinatesInLocationControl={!noCoordinates}
          showCoordinates={!noCoordinates}
          hideDetails
          showMap={false}
          fixedMap
          showLookup={false}
          showDivisions={false}
          isEditing
          isLoading={false}
          onChange={value => (address = value as typeof address)}
          onCoordinateChange={value => (coordinates = value)}
          onLookup={() => {}}
          onSelectCandidate={value => (address = value as typeof address)}
        />
      </section>
    {/snippet}
  </Search>
  <section data-saved-toolbar>
    {#snippet location()}
      <span class="shrink-0 font-semibold">📍 Sheung Wan</span>
    {/snippet}
    {#snippet settings()}
      <button type="button">Open to Sync</button>
    {/snippet}
    <Address
      {address}
      {coordinates}
      locationControl={location}
      toolbarControls={settings}
      displayAddressInToolbar
      showMap={false}
      fixedMap
      showLookup={false}
      showDivisions={false}
      bind:translations
      isEditing={!shortMode}
      isLoading={false}
      onChange={value => (address = value as typeof address)}
      onCoordinateChange={value => (coordinates = value)}
      onLookup={() => {}}
      onSelectCandidate={value => (address = value as typeof address)}
    />
  </section>
  <Profile
    localeState={locales}
    onLocaleStateChange={() => {}}
    values={{ en: { title: 'Breadline @ The One' } }}
    contextKey="flow"
    translate={async () => ({ status: 'translated', text: '' })}
    onTranslated={() => {}}
  >
    {#snippet toolbarMessage()}
      <Issues issues={['Edit Location name inheritance in the Location editor']} />
    {/snippet}
    {#snippet children()}
      <p>Breadline @ The One</p>
    {/snippet}
  </Profile>
</main>
