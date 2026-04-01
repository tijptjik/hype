<script lang="ts">
import { page } from '$app/state'

import HeadlessMapRenderCanvas from '$lib/bits/patterns/maps/HeadlessMapRenderCanvas.svelte'
</script>

<HeadlessMapRenderCanvas kind="layers" identifier={page.params.layer} />
