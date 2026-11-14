<script lang="ts">
// SVELTE
import { page } from '$app/state'
// COMPONENTS
import LocationReconciliation from '#lib/bits/patterns/resource/locationReconciliation/LocationReconciliation.svelte'
</script>
{#key page.params.project}
  <LocationReconciliation project={page.params.project ?? ''} />
{/key}
