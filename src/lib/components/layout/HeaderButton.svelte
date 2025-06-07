<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { FacetType } from '$lib/types';

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

let {
  facet,
  isActive = false
}: {
  facet: { label: string; ref: FacetType };
  isActive?: boolean;
} = $props();


// UTILS
const onclick = (e: MouseEvent) => {
  e.preventDefault();
  resourceState.setFacet(facet.ref);
};
</script>

<li>
  <a
    href="?facet={facet.ref}"
    class="btn btn-sm {isActive
      ? 'btn-primary'
      : 'btn-ghost'} text-white hover:btn-primary"
    {onclick}>
    {facet.label}
  </a>
</li>
