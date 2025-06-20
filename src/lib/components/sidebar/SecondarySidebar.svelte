<script lang="ts">
// SVELTE
import { page } from '$app/state';
// LIB
import { ADMIN_PATH } from '$lib/index';
// AUTH
import { hasControlPanelAccess } from '$lib/client/services/auth';
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// COMPONENTS
import UserMenu from '$lib/components/menu/UserMenu.svelte';
import Icon from '$lib/components/common/Icon.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// ICONS
import {
  InboxArrowDown,
  Map,
  CloudArrowUp,
  BuildingLibrary
} from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { SessionUser } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

let notificationCount = $derived(adminCtx.filteredTasks.length);

// Admin control items configuration
const adminControlItems = $derived.by(() => {
  if (
    !adminCtx.appCtx.user ||
    !hasControlPanelAccess(adminCtx.appCtx.user as SessionUser)
  ) {
    return [];
  }

  const items = [
    {
      href: `${ADMIN_PATH}/tasks`,
      iconSrc: InboxArrowDown,
      handleClick: (e: Event) => navigateOnAdmin(adminCtx, FirstClassResource.task),
      notificationCount: notificationCount
    }
  ];

  if (adminCtx.appCtx.isSuperAdmin()) {
    items.push(
      {
        href: `${ADMIN_PATH}/images/batch`,
        iconSrc: CloudArrowUp,
        handleClick: null,
        notificationCount: 0
      },
      {
        href: `${ADMIN_PATH}/hubs`,
        iconSrc: BuildingLibrary,
        handleClick: (e: Event) => navigateOnAdmin(adminCtx, FirstClassResource.hub),
        notificationCount: 0
      }
    );
  }

  items.push({
    href:
      adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
        ? `/features/${adminCtx.activeResourceRef}`
        : '/',
    iconSrc: Map,
    handleClick: null,
    notificationCount: 0
  });

  return items;
});

const isActive = (href: string) => {
  if (href === `${ADMIN_PATH}/tasks`) {
    return page.url.pathname.startsWith(`${ADMIN_PATH}/tasks`);
  } else if (href === `${ADMIN_PATH}`) {
    return (
      page.url.pathname.startsWith(`${ADMIN_PATH}`) &&
      page.url.pathname !== `${ADMIN_PATH}/tasks`
    );
  }
  return false;
};
</script>

<!-- SECONDARY SIDEBAR -->
<aside
  id="secondary-sidebar"
  class="flex h-screen w-20 flex-shrink-0 flex-col bg-base-300 caret-transparent">
  <!-- HEADER with UserMenu -->
  <div
    class="flex h-[72px] w-full flex-shrink-0 flex-row items-center justify-center bg-black p-2">
    <UserMenu />
  </div>

  <!-- ADMIN CONTROLS arranged vertically -->
  <div class="flex flex-grow flex-col items-center gap-2">
    {#each adminControlItems as item}
      <div class="flex-shrink-0">
        <a
          draggable="false"
          onclick={item.handleClick}
          href={item.href}
          class="group btn btn-circle btn-ghost relative h-[68px] select-none bg-inherit hover:bg-transparent {isActive(
            item.href
          )
            ? 'btn-active'
            : ''}">
          {#if item.notificationCount > 0}
            <div
              class="badge badge-primary badge-sm absolute right-0.5 top-[8px] size-5 text-xs">
              {item.notificationCount}
            </div>
          {/if}
          <div
            class="border-b-2 border-double border-transparent py-2 transition-colors group-[.btn-active]:cursor-default group-[.btn-active]:border-primary group-[:not(.btn-active)]:group-hover:border-base-100">
            <Icon size="24px" src={item.iconSrc} />
          </div>
        </a>
      </div>
    {/each}
  </div>
</aside>
