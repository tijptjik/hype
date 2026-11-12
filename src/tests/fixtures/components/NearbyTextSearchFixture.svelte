<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Search from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
setResponsiveCtx()
</script>
<main class="bg-panel @container mx-auto h-screen max-w-3xl p-4">
  <Search
    active
    focusRequest={0}
    initialMode="pin"
    hasPin
    coordinates={[114.15, 22.28]}
    onSelect={() => {}}
    onDropPin={() => {}}
  />
</main>
