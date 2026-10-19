<script lang="ts">
import ResourceTaskStatusBadge from '../../../components/ResourceTaskStatusBadge.svelte'
import type { Task } from '#lib/db/zod/schema/task.types.js'

let { entity }: { entity: Task } = $props()
</script>

<div
  class="col-start-2 row-start-1 row-span-2 flex items-center justify-end self-stretch border-l border-border/60 pl-3 @min-[48rem]:col-start-4 @min-[48rem]:row-span-1"
>
  <ResourceTaskStatusBadge {entity} />
</div>
