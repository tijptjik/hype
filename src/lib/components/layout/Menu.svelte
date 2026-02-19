<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { cubicInOut } from 'svelte/easing'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// LIB
import { ADMIN_PATH, DUAL_PANEL_MIN_WIDTH } from '$lib/index'
import { goto } from '$app/navigation'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import {
  Map as MapIcon,
  Funnel,
  Star,
  Cog6Tooth,
  ComputerDesktop,
  InformationCircle,
} from '@steeze-ui/heroicons'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { IconSource } from '@steeze-ui/svelte-icon'
import type { UserRoleDisco } from '$lib/types'
import { useSession } from '$lib/auth/client'

// CONTEXT
const appCtx = getAppCtx()

let { hub } = $props()

// STATE
const session = useSession()

let showAdminMenu = $derived(
  $session?.data?.user?.superAdmin ||
    $session?.data?.user?.roles?.some(
      (role: UserRoleDisco) =>
        role.role === 'owner' ||
        role.role === 'superadmin' ||
        role.role === 'maintainer' ||
        role.role === 'member',
    ),
)

function getMenuItems() {
  const commonPanels = [
    { icon: Funnel, label: m.menu_filters(), panel: Panel.filters },
    { icon: Star, label: m.menu_stars(), panel: Panel.stars },
    { icon: Cog6Tooth, label: m.menu_settings(), panel: Panel.settings },
  ]
  if (hub.isCore) {
    const prismPanel = { icon: MapIcon, label: m.maps__title(), panel: Panel.prisms }
    return [prismPanel, ...commonPanels]
  } else {
    const hubPanel = {
      icon: InformationCircle,
      label: m.menu_about(),
      panel: Panel.hub,
    }
    return [hubPanel, ...commonPanels]
  }
}

function handleMenuClick(panel: Panel) {
  if (panel === Panel.admin) {
    const currentPath = page.url.pathname
    if (currentPath.startsWith('/features/')) {
      // Navigate to corresponding admin page for the current feature
      goto(`${ADMIN_PATH}${currentPath}`)
    } else {
      // Navigate to admin homepage
      goto(`${ADMIN_PATH}/tasks`)
    }
  } else {
    appCtx.togglePanel(panel)
  }
}

// UGLY HACK TO FIX MENU POSITION
let initialInnerHeight = $state(window.innerHeight)
let innerHeight = $state(window.innerHeight)
let hasViewportHeightIncreased = $derived(innerHeight > initialInnerHeight)
</script>

{#snippet menuButton(icon: IconSource, label: string, panel: Panel)}
  <button
    class="flex min-h-12 flex-col items-center justify-center gap-1 p-1"
    class:text-secondary={panel === 'admin'}
    onclick={() => handleMenuClick(panel)}
  >
    <Icon
      src={icon}
      class="h-6 w-6 {panel === 'admin' ? 'text-secondary' : 'text-primary'}"
    />
    <span
      class="text-xs uppercase tracking-wider text-base-content/70 transition-opacity duration-300
      in:fade={{ duration: 300, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      {hasViewportHeightIncreased ? 'isMozilla opacity-0' : 'opacity-100'}"
      >{label}</span
    >
  </button>
{/snippet}

<svelte:window bind:innerHeight />

<nav
  id="menu"
  class="min-h-17 bottom-0 w-full border-t-3 border-base-300 bg-black px-4 py-2 caret-transparent md:px-0"
>
  <div class="flex w-full flex-row items-center justify-between">
    <div class="mx-auto flex max-w-180 grow items-center justify-around">
      {#each getMenuItems() as { icon, label, panel }}
        {@render menuButton(icon, label, panel)}
      {/each}
    </div>
    {#if showAdminMenu}
      <!-- Admin Menu -->
      <div class="absolute right-0 hidden flex-row items-center gap-2 px-4 lg:flex">
        {@render menuButton(ComputerDesktop, m.menu_admin(), Panel.admin)}
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

#menu {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 100;

  /* keep it above the curved corners / home indicator */
  /* base height + safe–area inset
  TODO Test on IOS whether this is needed. padding-bottom: env(safe-area-inset-bottom) adds extra space inside the element, but the element’s outer height stays at a hard 68 px.
  On devices with a non-zero bottom inset (e.g. iPhone with home-indicator), the menu may end up visually shorter than intended or its content can be pushed upward.

  A more robust pattern is to fold the inset into the computed height itself and reset the inner padding:
  height: calc(68px + env(safe-area-inset-bottom));
  */
  height: 68px;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
