<script lang="ts">
import ResourceTaskStatusBadge from '../../../components/ResourceTaskStatusBadge.svelte'
import type { Task } from '$lib/types'

let { entity }: { entity: Task } = $props()
</script>

<div class="bits-resource-row__status"><ResourceTaskStatusBadge {entity} /></div>
