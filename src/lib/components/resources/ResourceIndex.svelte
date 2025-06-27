<script lang="ts" generics="T extends Resource">
// COMPONENTS
import ResourceFilterBar from './common/ResourceFilterBar.svelte';
import ResourceVirtualList from './common/ResourceVirtualList.svelte';
// TYPES
import type { Resource } from '$lib/types';
import type { Snippet } from 'svelte';

let {
  entities,
  card,
  row,
  controlBar,
  listContainer = $bindable()
}: {
  entities: T[];
  card?: (entity: T, index: number) => any;
  row?: (entity: T, index: number) => any;
  controlBar?: Snippet;
  listContainer?: HTMLElement | null;
} = $props();
</script>

<ResourceFilterBar {controlBar} />
<ResourceVirtualList {entities} {card} {row} bind:listContainer />
