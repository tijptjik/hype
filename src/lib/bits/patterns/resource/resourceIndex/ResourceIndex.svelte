<script lang="ts" generics="T extends Resource">
// COMPONENTS
import ResourceVirtualList from '$lib/components/resources/common/ResourceVirtualList.svelte'
// TYPES
import type { Resource } from '$lib/types'
import type { ResourceIndexProps } from './resourceIndex.types'

let {
  resource,
  entities,
  card,
  row,
  listContainer = $bindable(),
}: ResourceIndexProps<T> = $props()
</script>

<ResourceVirtualList {resource} {entities} {card} {row} bind:listContainer />
