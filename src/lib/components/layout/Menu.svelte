<script lang="ts">
// SVELTE
import { page } from '$app/stores';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// I18N
import * as m from '$lib/paraglide/messages';
// LIB
import { ADMIN_PATH } from '$lib/index';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Map, Funnel, Star, Cog6Tooth, ComputerDesktop } from '@steeze-ui/heroicons';
// TYPES
import type { IconSource } from '@steeze-ui/svelte-icon';
import type { PanelState } from '$lib/context/map.svelte';
import { goto } from '$app/navigation';
// CONTEXT
const mapContext = getMapContext();

// STATE
const { session } = $page.data;

const menuItems = [
  { icon: Map, label: m.menu_maps(), panel: 'maps' },
  { icon: Funnel, label: m.menu_filters(), panel: 'filters' },
  { icon: Star, label: m.menu_stars(), panel: 'stars' },
  { icon: Cog6Tooth, label: m.menu_settings(), panel: 'settings' }
];

function handleMenuClick(panel: 'filters' | 'maps' | 'stars' | 'settings' | 'admin') {
  if (panel === 'admin') {
    goto(ADMIN_PATH);
  } else {
    const closeAll = window.innerWidth < 1320;
    mapContext.togglePanel(panel as keyof PanelState, closeAll);
  }
}
</script>

{#snippet menuButton(icon: IconSource, label: string, panel: string)}
  <button
    class="flex flex-col items-center gap-1 p-2"
    class:text-secondary={panel === 'admin'}
    onclick={() => handleMenuClick(panel as keyof PanelState)}>
    <Icon
      src={icon}
      class="h-6 w-6 {panel === 'admin' ? 'text-secondary' : 'text-primary'}" />
    <span
      class="text-xs uppercase tracking-wider text-base-content/70"
      class:text-secondary={panel === 'admin'}>{label}</span>
  </button>
{/snippet}

<nav class="border-t border-base-300 bg-black px-4 py-2 caret-transparent md:px-0">
  <div class="flex w-full flex-row items-center justify-between">
    <div class="mx-auto flex max-w-[720px] flex-grow items-center justify-around">
      {#each menuItems as { icon, label, panel }}
        {@render menuButton(icon, label, panel as keyof PanelState)}
      {/each}
    </div>
    {#if session?.user?.roles?.some((role) => role.role === 'owner' || role.role === 'superadmin' || role.role === 'maintainer')}
      <!-- Admin Menu -->
      <div class="absolute right-0 hidden flex-row items-center gap-2 px-4 lg:flex">
        {@render menuButton(ComputerDesktop, m.menu_admin(), 'admin')}
      </div>
    {/if}
  </div>
</nav>
