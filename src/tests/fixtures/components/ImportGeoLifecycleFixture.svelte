<script lang="ts">
import GeoLookupStep from '#lib/bits/patterns/import/components/features/steps/geo/GeoLookupStep.svelte'
let startProcessing = $state<(() => void) | undefined>()
let pauseAction = $state<(() => void) | undefined>()
</script>
<button type="button" onclick={() => startProcessing?.()}>Start geocoding</button>
<button type="button" onclick={() => pauseAction?.()}>Pause geocoding</button>
<GeoLookupStep bind:startProcessing bind:pauseAction />
