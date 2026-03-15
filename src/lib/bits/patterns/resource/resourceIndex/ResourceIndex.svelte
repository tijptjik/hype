<script lang="ts" generics="T extends Resource">
// BITS
import ResourceIndex from '$lib/bits/custom/index/ResourceIndex.svelte'
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

<ResourceIndex {resource} {entities} {card} {row} bind:listContainer />
