<script lang="ts">
import { goto } from '$app/navigation';
import * as m from '$lib/paraglide/messages.js';
import { slide } from 'svelte/transition';
// STORES
import { navItems } from '$lib/stores/navigation.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type {
  EntityRouter,
  Resource,
  ResourceType,
  FacetType,
  SuperFormResult
} from '$lib/types';

// CONFIG
const menuItems: Record<ResourceType, { label: string; ref: FacetType }[]> = {
  organisation: [
    {
      label: m.organisation__core(),
      ref: 'core'
    },
    {
      label: m.organisation__images(),
      ref: 'images'
    }
  ],
  project: [
    {
      label: m.project__core(),
      ref: 'core'
    },
    {
      label: m.project__fields(),
      ref: 'fields'
    },
    {
      label: m.project__images(),
      ref: 'images'
    }
  ],
  layer: [
    {
      label: m.layer__core(),
      ref: 'core'
    }
  ],
  feature: [
    {
      label: m.feature__core(),
      ref: 'core'
    },
    {
      label: m.feature__address(),
      ref: 'address'
    },
    {
      label: m.feature__images(),
      ref: 'images'
    }
  ]
};

// STATE : PROPS
let { title, form }: { title: string; form: SuperFormResult<Resource> } = $props();

// STATE : CONTEXT
const routerState = getRouterState() as EntityRouter;
const resourceState = getHierarchicalResourceState();

// Get parent info
const parents = $derived(resourceState.parents);

// Helper function to get href while preserving query params
function getParentHref(parentPath: string): string {
  const url = new URL(window.location.href);
  url.pathname = parentPath;
  return url.toString();
}
const onclick = (e: Event, url: string) => {
  e.preventDefault();
  routerState.update(url);
  goto(url).then(() => goto(url));
}
</script>

<header
  class="navbar sticky left-0 top-0 z-20 h-17.5 w-full flex-none bg-gradient-to-r from-rose-500 to-fuchsia-800 px-12 py-4 shadow-lg">
  <div class="@container flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[routerState.resource].icon} class="h-6 w-6" />
      <div class=" flex flex-col">
        <div class="hidden @md:flex items-center space-x-2 text-sm font-medium text-gray-300">
          {#each resourceState.parents as parent, i}
            <a
              draggable="false"
              out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
              in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
              href={getParentHref(parent.href)}
              onclick={(e) => onclick(e, getParentHref(parent.href))}
              class="inline-block h-5 overflow-hidden whitespace-nowrap hover:text-white select-none">
              {parent.name}
            </a>
            {#if i < resourceState.parents.length - 1}
              <span
                out:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                in:slide={{ duration: 200, delay: 100 * i, axis: 'x' }}
                class="inline-block whitespace-nowrap text-gray-400">/</span>
            {/if}
          {/each}
        </div>
        <h2 class="text-2xl font-semibold transition-all truncate max-w-0 @xs:max-w-[14rem] @sm:max-w-[18rem] @md:max-w-[24rem] @lg:max-w-[30rem] @xl:max-w-[34rem] @2xl:max-w-[38rem] @3xl:max-w-[42rem] @4xl:max-w-[48rem] @5xl:max-w-[56rem] @6xl:max-w-[64rem]">{title}</h2>
      </div>
    </div>
  </div>
  <div class="flex-none">
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each menuItems[routerState.resource] as facet}
        <MenuItem {facet} />
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <EntityActions {form} />
    </ul>
  </div>
</header>
