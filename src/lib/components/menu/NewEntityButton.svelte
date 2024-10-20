<script lang="ts">
import type { ResourceType } from '$lib/types';
import { getRouterState } from '$lib/context/router.svelte';
import { page } from '$app/stores';
import { goto } from '$app/navigation';
// STATE : PROPS
const props = $props<{
  resourceType: ResourceType;
}>();

// STATE : CONTEXT
const routerState = getRouterState();

// UTILS
const getUrl = (facet: string) => {
  const url = new URL($page.url.href);
  url.hash = `#new`;
  return url.toString();
};

const onclick = (e: MouseEvent) => {
  e.preventDefault();
  const url = new URL(window.location.href);
  url.pathname = `/admin/${routerState.resourceToRef[props.resourceType as ResourceType]}/new`;
  url.hash = `#core`;
//   routerState.entity = false;
//   routerState.facet = 'core';
//   routerState.url = url;
//   routerState.facet = facet.ref;
  goto(url.toString());
};

</script>

<button {onclick} class="btn btn-sm btn-primary text-white">
   ADD
</button>