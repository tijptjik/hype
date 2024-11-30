<script lang="ts">
import { goToFacet } from '$lib';
import { getRouterState } from '$lib/context/router.svelte';
import { page } from '$app/stores';
// TYPES
import type { FacetType } from '$lib/types';

// TYPES
type Props = { facet: { ref: FacetType; label: string } };

// PROPS
const { facet }: Props = $props();

// STATE : CONTEXT
const routerState = getRouterState();

// UTILS
const onclick = (e: MouseEvent) => {
  e.preventDefault();
  routerState.updateWith({ facet: facet.ref });
  goToFacet(e, routerState, facet.ref);
};
</script>

<li class="group">
  <a
    draggable="false"
    href={$page.url.href}
    {onclick}
    class="flex flex-col items-center px-4 py-2 uppercase transition-colors duration-200 ease-in-out hover:bg-transparent select-none"
    class:active={routerState.facet === facet.ref}>
    <span>{facet.label}</span>
    <span
      class="mt-1 h-0.25 w-full transition-colors duration-200 ease-in-out"
      class:bg-white={routerState.facet === facet.ref ||
        (routerState.facet === false && facet.ref === 'core')}
      class:bg-transparent={routerState.facet !== facet.ref}
      class:group-hover:bg-white={routerState.facet !== facet.ref}></span>
  </a>
</li>
