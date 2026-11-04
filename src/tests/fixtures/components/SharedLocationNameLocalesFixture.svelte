<script lang="ts">
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
let names = $state({ en: 'Bakery', ja: 'パン屋' } as Record<string, string>)
let translations = $state(true)
</script>
<button type="button" onclick={() => (translations = !translations)}>
  Toggle languages
</button>
<DraftLocationNameFields
  {names}
  {translations}
  kind="establishment"
  isEditing={true}
  localeState={{
    selectedLocales: ['pt', 'en', 'fil'],
    visibleLocales: ['pt', 'en', 'fil'],
    expanded: true,
  }}
  onChange={value => (names = value)}
/>
<output data-testid="names">{JSON.stringify(names)}</output>
