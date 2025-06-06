<script lang="ts">
// SVELTE
import { page } from '$app/state';
// LIB
import { ADMIN_PATH } from '$lib/index';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';

let {
  href,
  iconSrc,
  handleClick,
  notificationCount = 0
} = $props<{
  href: string;
  iconSrc: any;
  handleClick?: (e: Event, ...args: any[]) => void;
  notificationCount?: number;
}>();

const isActive = () => {
  if (href === `${ADMIN_PATH}/tasks`) {
    return page.url.pathname.startsWith(`${ADMIN_PATH}/tasks`);
  } else if (href === `${ADMIN_PATH}`) {
    return (
      page.url.pathname.startsWith(`${ADMIN_PATH}`) &&
      page.url.pathname !== '{ADMIN_PATH}/tasks'
    );
  }
};
</script>

<a
  draggable="false"
  onclick={handleClick}
  {href}
  class="group btn btn-circle btn-ghost select-none bg-inherit hover:bg-transparent {isActive()
    ? 'btn-active'
    : ''}">
  {#if notificationCount > 0}
    <div class="badge badge-primary badge-sm absolute -right-1 -top-1 size-5 text-xs">
      {notificationCount}
    </div>
  {/if}
  <div
    class="border-b-2 border-double border-transparent py-2 transition-colors group-[.btn-active]:cursor-default group-[.btn-active]:border-primary group-[:not(.btn-active)]:group-hover:border-base-100">
    <Icon size="24px" src={iconSrc} />
  </div>
</a>
