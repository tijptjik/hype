<script lang="ts">
import LocationNameFields from '#lib/bits/patterns/forms/localLocationAddress/LocationNameFields.svelte'
let names = $state<Record<string, string>>({ en: 'Bakery', ja: 'パン屋' })
</script>
<LocationNameFields {names} onChange={next => (names = next)} />
<output data-testid="names">{JSON.stringify(names)}</output>
