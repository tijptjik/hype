<script lang="ts">
import { page } from '$app/stores';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { FacetType } from '$lib/types';

// TYPES
type Props = { facet: { ref: FacetType; label: string } };

// PROPS
const { facet }: Props = $props();

// STATE : CONTEXT
const resourceState = getHierarchicalResourceState();

// UTILS
const onclick = (e: MouseEvent) => {
  e.preventDefault();
  resourceState.setFacet(facet.ref);
};
</script>

<li class="group">
  <a
    draggable="false"
    href={`${$page.url.href}#${facet.ref}`}
    {onclick}
    class="flex select-none flex-col items-center px-4 py-2 uppercase transition-colors duration-200 ease-in-out hover:bg-transparent"
    class:active={resourceState.state.active.facet === facet.ref}>
    <span>{facet.label}</span>
    <span
      class="mt-1 h-0.25 w-full transition-colors duration-200 ease-in-out"
      class:bg-white={resourceState.state.active.facet === facet.ref ||
        (resourceState.state.active.facet === false && facet.ref === 'core')}
      class:bg-transparent={resourceState.state.active.facet !== facet.ref}
      class:group-hover:bg-white={resourceState.state.active.facet !== facet.ref}
    ></span>
  </a>
</li>
