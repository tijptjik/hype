<script lang="ts">
// SVELTE
import { page } from '$app/state';
import { cubicInOut } from 'svelte/easing';
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { goto } from '$app/navigation';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Map, Funnel, Star, Cog6Tooth, ComputerDesktop } from '@steeze-ui/heroicons';
// TYPES
import type { IconSource } from '@steeze-ui/svelte-icon';
import type { PanelState } from '$lib/types';

// CONTEXT
const mapCtx = getMapCtx();

// STATE
const { session } = page.data;

const menuItems = [
  { icon: Map, label: m.menu_maps(), panel: 'maps' },
  { icon: Funnel, label: m.menu_filters(), panel: 'filters' },
  { icon: Star, label: m.menu_stars(), panel: 'stars' },
  { icon: Cog6Tooth, label: m.menu_settings(), panel: 'settings' }
];

function handleMenuClick(panel: 'filters' | 'maps' | 'stars' | 'settings' | 'admin') {
  if (panel === 'admin') {
    const currentPath = page.url.pathname;
    if (currentPath.startsWith('/features/')) {
      // Navigate to corresponding admin page for the current feature
      goto(`${ADMIN_PATH}${currentPath}`);
    } else {
      // Navigate to admin homepage
      goto(ADMIN_PATH);
    }
  } else {
    const closeAll = window.innerWidth < 1320;
    mapCtx.togglePanel(panel as keyof PanelState, closeAll);
  }
}

// UGLY HACK TO FIX MENU POSITION
let initialInnerHeight = $state(window.innerHeight);
let innerHeight = $state(window.innerHeight);
let hasViewportHeightIncreased = $derived(innerHeight > initialInnerHeight);
</script>

{#snippet menuButton(icon: IconSource, label: string, panel: string)}
  <button
    class="flex min-h-12 flex-col items-center justify-center gap-1 p-1"
    class:text-secondary={panel === 'admin'}
    onclick={() => handleMenuClick(panel as keyof PanelState)}>
    <Icon
      src={icon}
      class="h-6 w-6 {panel === 'admin' ? 'text-secondary' : 'text-primary'}" />
    <span
      class="text-xs uppercase tracking-wider text-base-content/70 transition-opacity duration-300
      in:fade={{ duration: 300, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      {hasViewportHeightIncreased ? 'isMozilla opacity-0' : 'opacity-100'}"
      >{label}</span>
  </button>
{/snippet}

<svelte:window bind:innerHeight />

<nav
  id="menu"
  class="min-h-17 bottom-0 w-full border-t-3 border-base-300 bg-black px-4 py-2 caret-transparent md:px-0">
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

<style>
@supports (-moz-appearance: none) {
  .isMozilla {
    display: none;
  }
}
</style>
