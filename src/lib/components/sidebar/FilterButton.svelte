<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Minus, Plus } from '@steeze-ui/heroicons';
// TYPES
import type { ResourceTypeWithChildren } from '$lib/types';

// CONFIG
const resourceState = getHierarchicalResourceState();

// STATE
let { resourceType, id, onHoverOnly = true } = $props();
</script>

<button
  class="btn btn-circle btn-ghost btn-sm transition-all {onHoverOnly
    ? 'absolute right-4 top-1/2 -translate-y-1/2  opacity-0 active:-translate-y-1/2 group-hover:opacity-100'
    : ''} hover:bg-base-200"
  aria-label={resourceState.state.prisms[
    resourceType as ResourceTypeWithChildren
  ]?.includes(id)
    ? 'Remove item from filters'
    : 'Add item to filters'}
  onclick={() => resourceState.togglePrism(resourceType, id)}>
  <Icon
    src={resourceState.state.prisms[resourceType as ResourceTypeWithChildren]?.includes(
      id
    )
      ? Minus
      : Plus}
    class="h-4 w-4" />
</button>
