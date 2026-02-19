<script lang="ts">
// SVELTE
import { page } from '$app/state'
// LIB
import { ADMIN_PATH } from '$lib/index'
// AUTH
import { hasControlPanelAccess } from '$lib/client/services/auth'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import {
  InboxArrowDown,
  Map as MapIcon,
  CloudArrowUp,
  BuildingLibrary,
  MapPin,
} from '@steeze-ui/heroicons'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { SessionUser, PanelProps } from '$lib/types'

// CONTEXT
const adminCtx = getAdminCtx()

// PROPS
const { ...panelProps }: PanelProps = $props()

let notificationCount = $derived(adminCtx.filteredTasks.length)
let featureCount = $derived(adminCtx.filteredFeatures.length)

// Admin control items configuration
const adminControlItems = $derived.by(() => {
  if (
    !adminCtx.appCtx.user ||
    !hasControlPanelAccess(adminCtx.appCtx.user as SessionUser)
  ) {
    return []
  }

  const items = [
    {
      href: `${ADMIN_PATH}/features`,
      iconSrc: MapPin,
      handleClick: () => navigateOnAdmin(adminCtx, FirstClassResource.feature),
      notificationCount: featureCount,
      color: {
        text: 'text-primary',
        border: 'border-primary',
      },
    },
    {
      href: `${ADMIN_PATH}/tasks`,
      iconSrc: InboxArrowDown,
      handleClick: () => navigateOnAdmin(adminCtx, FirstClassResource.task),
      notificationCount: notificationCount,
      color: {
        text: 'text-secondary',
        border: 'border-secondary',
      },
    },
  ]

  if (adminCtx.appCtx.isSuperAdmin()) {
    items.push(
      {
        href: `${ADMIN_PATH}/images/batch`,
        iconSrc: CloudArrowUp,
        handleClick: null,
        notificationCount: 0,
        color: {
          text: 'text-accent',
          border: 'border-accent',
        },
      },
      {
        href: `${ADMIN_PATH}/hubs`,
        iconSrc: BuildingLibrary,
        handleClick: () => navigateOnAdmin(adminCtx, FirstClassResource.hub),
        notificationCount: 0,
        color: {
          text: 'text-accent',
          border: 'border-accent',
        },
      },
    )
  }

  items.push({
    href:
      adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
        ? `/features/${adminCtx.activeResourceRef}`
        : '/',
    iconSrc: MapIcon,
    handleClick: null,
    notificationCount: 0,
    color: {
      text: 'text-primary',
      border: 'border-primary',
    },
  })

  return items
})

const isActive = (href: string) => {
  if (href === '/') {
    return false
  }
  return page.url.pathname.startsWith(href)
}
</script>

<!-- SECONDARY SIDEBAR -->
<footer
  class="flex min-h-0 w-full flex-shrink-0 {panelProps.isNarrow
    ? 'flex-col items-center pb-2'
    : 'flex-row-reverse items-center justify-center gap-3'}"
>
  <!-- ADMIN CONTROLS arranged vertically -->
  {#each adminControlItems as item}
    <div class="flex-shrink-0 flex-col items-center justify-center">
      <a
        draggable="false"
        onclick={item.handleClick}
        href={item.href}
        class="group btn btn-circle btn-ghost relative h-[68px] select-none bg-inherit {isActive(
          item.href
        )
          ? item.color.text
          : 'text-base-content/90 hover:text-base-content/70'}"
      >
        {#if item.notificationCount > 0}
          <div
            class="badge badge-primary badge-sm absolute right-0.5 top-[8px] size-5 {item.notificationCount >
            99
              ? 'text-[1.2em]'
              : 'text-xs'}"
          >
            {item.notificationCount > 99 ? '∞' : item.notificationCount}
          </div>
        {/if}
        <Icon class="h-8 w-8" src={item.iconSrc} />
      </a>
    </div>
  {/each}
</footer>
