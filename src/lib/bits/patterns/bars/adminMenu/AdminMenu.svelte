<script lang="ts">
// SVELTE
import { page } from '$app/state'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// LIB
import { ADMIN_PATH } from '$lib/index'
// AUTH
import { hasControlPanelAccess } from '$lib/client/services/auth'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import CloudArrowUp from 'virtual:icons/lucide/cloud-upload'
import BuildingLibrary from 'virtual:icons/lucide/landmark'
import InboxArrowDown from 'virtual:icons/lucide/mailbox'
import MapIcon from 'virtual:icons/lucide/map'
import MapPin from 'virtual:icons/lucide/map-pin'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { SessionUser } from '$lib/types'
import type { AdminMenuItem, AdminMenuProps } from './adminMenu.types'

const adminCtx = getAdminCtx()

let { isNarrow }: AdminMenuProps = $props()

const notificationCount = $derived(adminCtx.filteredTasks.length)
const featureCount = $derived(adminCtx.filteredFeatures.length)

const adminMenuItems = $derived.by((): AdminMenuItem[] => {
  if (
    !adminCtx.appCtx.user ||
    !hasControlPanelAccess(adminCtx.appCtx.user as SessionUser)
  ) {
    return []
  }

  const items: AdminMenuItem[] = [
    {
      href: `${ADMIN_PATH}/features`,
      label: 'Features',
      icon: MapPin,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.feature),
      notificationCount: featureCount,
      tone: 'primary',
    },
    {
      href: `${ADMIN_PATH}/tasks`,
      label: 'Tasks',
      icon: InboxArrowDown,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.task),
      notificationCount,
      tone: 'secondary',
    },
  ]

  if (adminCtx.appCtx.isSuperAdmin()) {
    items.push(
      {
        href: `${ADMIN_PATH}/images/batch`,
        label: 'Uploads',
        icon: CloudArrowUp,
        tone: 'accent',
      },
      {
        href: `${ADMIN_PATH}/hubs`,
        label: 'Hubs',
        icon: BuildingLibrary,
        onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.hub),
        tone: 'accent',
      },
    )
  }

  items.push({
    href:
      adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
        ? `/features/${adminCtx.activeResourceRef}`
        : '/',
    label: 'Map',
    icon: MapIcon,
    tone: 'primary',
  })

  return items
})

const classes = $derived(
  [
    'bits-theme',
    'bits-admin-menu',
    isNarrow ? 'bits-admin-menu--narrow' : 'bits-admin-menu--wide',
  ].join(' '),
)

function isActive(href: string): boolean {
  if (href === '/') {
    return false
  }

  return page.url.pathname.startsWith(href)
}

function getButtonColor(item: AdminMenuItem): 'neutral' | 'secondary' | 'accent' {
  if (item.tone === 'secondary') {
    return 'secondary'
  }

  if (item.tone === 'accent') {
    return 'accent'
  }

  return 'neutral'
}

function getActiveColor(item: AdminMenuItem): string {
  if (item.tone === 'secondary') {
    return 'var(--color-secondary)'
  }

  if (item.tone === 'accent') {
    return 'var(--color-accent)'
  }

  return 'var(--color-primary)'
}
</script>

<nav class={classes} aria-label="Admin menu">
  <div class="bits-admin-menu__list">
    {#each adminMenuItems as item (item.href)}
      {@const active = isActive(item.href)}
      {@const count = item.notificationCount ?? 0}

      <div
        class="bits-admin-menu__item"
        data-active={active ? 'true' : undefined}
        style={`--bits-admin-menu-active-color: ${getActiveColor(item)};`}
      >
        <Button
          text={item.label}
          iconComponent={item.icon}
          href={item.href}
          onClick={item.onClick ?? undefined}
          color={getButtonColor(item)}
          style="ghost"
          size="md"
          modifier="circle"
          hideLabel={true}
          hideLabelInstantly={true}
          class="bits-admin-menu__button"
          attrs={{
            title: item.label,
            'aria-current': active ? 'page' : undefined,
          }}
        />

        {#if count > 0}
          <span
            class="bits-admin-menu__badge"
            class:bits-admin-menu__badge--accent={item.tone === 'accent'}
            class:bits-admin-menu__badge--overflow={count > 99}
          >
            {count > 99 ? '∞' : count}
          </span>
        {/if}
      </div>
    {/each}
  </div>
</nav>
