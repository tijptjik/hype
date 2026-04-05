<script lang="ts">
import { page } from '$app/state'

import HeadlessMapRenderCanvas from '$lib/bits/patterns/maps/HeadlessMapRenderCanvas.svelte'
</script>

<HeadlessMapRenderCanvas kind="projects" identifier={page.params.project} />
