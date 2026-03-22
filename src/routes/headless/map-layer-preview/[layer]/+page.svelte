<script lang="ts">
import { page } from '$app/state'

import HeadlessMapPreviewCanvas from '$lib/components/common/HeadlessMapPreviewCanvas.svelte'
</script>

<HeadlessMapPreviewCanvas kind="layers" identifier={page.params.layer} />
