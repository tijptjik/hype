<script lang="ts">
import { page } from '$app/stores';
import Icon from '$lib/components/common/Icon.svelte';

let {
  href,
  iconSrc,
  handleClick,
  matchFromStart = true,
  notificationCount = 0
} = $props<{
  href: string;
  iconSrc: any;
  handleClick?: (e: Event, ...args: any[]) => void;
  matchFromStart?: boolean;
  notificationCount?: number;
}>();

const isActive = () => {
  if (href === '/admin/tasks') {
    return $page.url.pathname.startsWith('/admin/tasks');
  } else if (href === '/admin') {
    return (
      $page.url.pathname.startsWith('/admin') && $page.url.pathname !== '/admin/tasks'
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
    class="border-b-2 border-double border-transparent py-2 transition-colors group-[.btn-active]:cursor-default group-[.btn-active]:border-primary group-[:not(.btn-active)]:group-hover:border-secondary">
    <Icon size="24px" src={iconSrc} />
  </div>
</a>
