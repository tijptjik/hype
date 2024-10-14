<script lang="ts">
import { page } from '$app/stores';
import { Icon } from '@steeze-ui/svelte-icon';
import { Bars3 } from '@steeze-ui/heroicons';
import { navItems } from '$lib/stores/navigation.svelte';
import * as m from '$lib/paraglide/messages.js';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import OrganisationActions from '$lib/components/menu/OrganisationActions.svelte';
import ProjectActions from '$lib/components/menu/ProjectActions.svelte';
import LayerActions from '$lib/components/menu/LayerActions.svelte';
import FeatureActions from '$lib/components/menu/FeatureActions.svelte';
import { meta } from '$lib/stores/resources.svelte';
import { type ResourceTypes } from '$lib/types';

// TYPES
type Props = { 
  active: Proxy<{ 
    resourceType: ResourceTypes; 
    section: string; 
    ref: string | false 
  }>,
  form?: unknown 
}

// STATE : PROPS
let { active, form = undefined } : Props = $props();


// STATE : DERIVED
const title = $derived(() => {
  return meta.title;
});

// CONFIG

const menuActions = {
  organisation: OrganisationActions,
  project: ProjectActions,
  layer: LayerActions,
  feature: FeatureActions
};

const menuItems = {
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

// UTILS

const getUrl = (section: string) => {
  const path = $page.url.pathname;
  const queryParams = $page.url.search;
  const pathParts = path.split('/').filter(Boolean);
  pathParts[pathParts.length - 1] = section;
  return `/${pathParts.join('/')}${queryParams}`;
};
</script>

<header class="navbar h-17.5 px-12 py-4 shadow-lg {active().ref === false ? 'bg-base-300' : 'bg-gradient-to-r from-rose-500 to-fuchsia-800'}">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[active().resourceType as ResourceTypes].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title()}</h2>
    </div>
  </div>
  <div class="flex-none">
    {#if active().ref !== false}
    {@const Actions = menuActions[active().resourceType as ResourceTypes]}
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each menuItems[active().resourceType as ResourceTypes] as item}
        <MenuItem
          label={item.label}
          href={getUrl(item.ref)}
          isActive={active().section == item.ref} />
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <Actions />
    </ul>
    {:else}
     <FilterInput resourceType={active().resourceType as ResourceTypes} rounded={true}/>
    {/if}
  </div>
</header>
