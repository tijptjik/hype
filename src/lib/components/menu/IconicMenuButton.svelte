<script lang="ts">
import { page } from '$app/stores';
import Icon from '$lib/components/common/Icon.svelte';

let {
  href,
  iconSrc,
  matchFromStart = true,
  notificationCount = 0
} = $props<{ href: string; iconSrc: any; matchFromStart?: boolean; notificationCount?: number }>();

const isActive = () => {
  if (matchFromStart) {
    return $page.url.pathname.startsWith(href);
  }
  return $page.url.pathname.endsWith(href);
};
</script>

<a
  draggable="false"
  {href}
  class="group btn btn-circle btn-ghost bg-inherit hover:bg-transparent select-none {isActive() ? 'btn-active' : ''}">
  {#if notificationCount > 0}
    <div class="badge size-5 badge-sm badge-primary absolute -top-1 -right-1 text-xs">{notificationCount}</div>
  {/if}
  <div
   class="border-b-2 border-double border-transparent py-2 transition-colors group-[.btn-active]:border-primary group-[.btn-active]:cursor-default group-[:not(.btn-active)]:group-hover:border-secondary">
    <Icon size="24px" src={iconSrc} />
  </div>
</a>
