<script lang="ts">
import { onMount } from 'svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
const responsive = setResponsiveCtx()
onMount(() => {
  responsive.setWindowDimensions(window.innerWidth, window.innerHeight)
})
import CreateLocalLocation from '#lib/bits/patterns/forms/featureLocation/CreateLocalLocation.svelte'
import { LocationKindSchema } from '#lib/locations/kinds.js'
let created = $state('')
</script>
<main class="mx-auto max-w-3xl p-4">
  <CreateLocalLocation
    open
    hideTrigger
    initialKind={LocationKindSchema.parse('building_part')}
    initialName="East Wing"
    projectId="project"
    coordinates={[114.1, 22.3]}
    disabled={false}
    onCreated={row => (created = row.locationId)}
  />
  <output data-created>{created}</output>
</main>
