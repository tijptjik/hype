<script lang="ts">
import Search from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
let custom = $state(false)
let atEnd = $state(false)
let selected = $state('')
const rowsMode = location.search.includes('rows')
</script>
<main
  class="bg-panel mx-auto flex h-dvh min-h-0 max-w-5xl flex-col overflow-hidden p-4"
  data-at-end={atEnd}
>
  <Search
    active={true}
    focusRequest={0}
    preferredKind="establishment"
    allowedLocationKinds={['establishment']}
    suggestionKinds={['establishment', 'building', 'address']}
    searchRequest={{ id: 1, mode: 'search', query: rowsMode ? 'Rows' : 'Missing shop' }}
    onSelect={result => (selected = result.names.en)}
    onScrollEndChange={value => (atEnd = value)}
    onManualEntry={() => (custom = true)}
  />
  {#if selected}
    <p data-selected>{selected}</p>
  {/if}
  {#if custom}
    <p role="status">Custom establishment requested</p>
  {/if}
</main>
