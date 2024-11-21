<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
// STORES
import { navItems } from '$lib/stores/navigation.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Bars3 } from '@steeze-ui/heroicons';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
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

// STATE : CONTEXT :: ROUTER
const { resource, entity } = getRouterState() as EntityRouter;
</script>

<header
  class="navbar sticky left-0 top-0 z-20 h-17.5 w-full flex-none bg-gradient-to-r from-rose-500 to-fuchsia-800 px-12 py-4 shadow-lg">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[resource].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title}</h2>
    </div>
  </div>
  <div class="flex-none">
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each menuItems[resource] as facet}
        <MenuItem {facet} />
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <EntityActions {form} />
    </ul>
  </div>
</header>
