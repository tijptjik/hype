<script lang="ts">
import { page } from '$app/state'

import HeadlessMapRenderCanvas from '$lib/components/common/HeadlessMapRenderCanvas.svelte'
</script>

<HeadlessMapRenderCanvas kind="projects" identifier={page.params.project} />
