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
import InboxArrowDown from 'virtual:icons/lucide/mailbox'
import MapIcon from 'virtual:icons/lucide/map'
import CloudArrowUp from 'virtual:icons/lucide/cloud-upload'
import BuildingLibrary from 'virtual:icons/lucide/landmark'
import MapPin from 'virtual:icons/lucide/map-pin'
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
  class="flex min-h-0 w-full shrink-0 {panelProps.isNarrow
    ? 'flex-col items-center pb-3 gap-3 pt-4'
    : 'flex-row-reverse items-center justify-center gap-2 h-16'}"
>
  <!-- ADMIN CONTROLS arranged vertically -->
  {#each adminControlItems as item}
    <div class="shrink-0 flex-col items-center justify-center">
      <a
        draggable="false"
        onclick={item.handleClick}
        href={item.href}
        class="group btn btn-circle btn-ghost relative select-none bg-inherit {isActive(
          item.href
        )
          ? item.color.text
          : 'text-base-content/90 hover:text-base-content/70'}"
      >
        {#if item.notificationCount > 0}
          <div
            class="badge badge-primary badge-sm absolute -right-px -top-0.5 size-5 {item.notificationCount >
            99
              ? 'text-[1.2em] pb-0.5'
              : 'text-xs pb-px'}"
          >
            {item.notificationCount > 99 ? '∞' : item.notificationCount}
          </div>
        {/if}
        <item.iconSrc width={28} height={28} />
      </a>
    </div>
  {/each}
</footer>
