<script lang="ts">
// COMPONENTS
import LocationKindField from '#lib/bits/patterns/forms/localLocationAddress/LocationKindField.svelte'
// DOMAIN
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
let type = $state<LocationKind>('establishment')
</script>
<main class="mx-auto grid max-w-2xl gap-8 p-4">
  <h1 class="text-xl font-semibold">Location matching taxonomy</h1>
  <LocationKindField
    value={type}
    allowPartCreation={true}
    onChange={next => (type = next)}
  />
  <output data-taxonomy>{JSON.stringify(locationTaxonomy(type))}</output>
</main>
