<script lang="ts">
import ResourceStatusBadgeTask from '$lib/components/resources/common/variants/ResourceStatusBadgeTask.svelte'
import type { Task } from '$lib/types'

let { entity }: { entity: Task } = $props()
</script>

<div class="bits-resource-row__status"><ResourceStatusBadgeTask {entity} /></div>
