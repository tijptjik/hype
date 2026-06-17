<script lang="ts">
// SVELTE
import { page } from '$app/state'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// LIB
import { ADMIN_PATH } from '$lib/index'
// AUTH
import { canViewAnalytics, hasControlPanelAccess } from '$lib/client/services/auth'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import ChartColumnIncreasing from 'virtual:icons/lucide/chart-column-increasing'
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
const PAGE_SIZE = 5
const WHEEL_INTENT_THRESHOLD = 12
const PAGE_SCROLL_SETTLE_MS = 220

let { isNarrow }: AdminMenuProps = $props()
let viewportElement = $state<HTMLDivElement | null>(null)
let pageScrollLock = $state(false)
let pageScrollLockTimeout: ReturnType<typeof setTimeout> | null = null
let isScrollDetectionEnabled = $state(false)
let initialScrollTimeout: ReturnType<typeof setTimeout> | null = null

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
    },
    {
      href: `${ADMIN_PATH}/tasks`,
      label: 'Tasks',
      icon: InboxArrowDown,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.task),
      notificationCount,
    },
  ]

  if (canViewAnalytics(adminCtx.appCtx.user as SessionUser)) {
    items.push({
      href: `${ADMIN_PATH}/analytics`,
      label: 'Analytics',
      icon: ChartColumnIncreasing,
    })
  }

  if (adminCtx.appCtx.isSuperAdmin()) {
    items.push({
      href: `${ADMIN_PATH}/hubs`,
      label: 'Hubs',
      icon: BuildingLibrary,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.hub),
    })
  }

  items.push({
    href:
      adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
        ? `/features/${adminCtx.activeResourceRef}`
        : '/',
    label: 'Map',
    icon: MapIcon,
  })

  if (adminCtx.appCtx.isSuperAdmin()) {
    items.push({
      href: `${ADMIN_PATH}/import`,
      label: 'Uploads',
      icon: CloudArrowUp,
    })
  }

  return items
})

const menuPages = $derived.by(() => {
  const pages: AdminMenuItem[][] = []

  for (let index = 0; index < adminMenuItems.length; index += PAGE_SIZE) {
    pages.push(adminMenuItems.slice(index, index + PAGE_SIZE))
  }

  return pages
})

const visibleMenuPages = $derived.by(() =>
  menuPages.map((menuPage, pageIndex) => {
    if (!isNarrow || menuPage.length >= PAGE_SIZE) {
      return menuPage.map(item => ({ key: item.href, item, isPlaceholder: false }))
    }

    const placeholderCount = PAGE_SIZE - menuPage.length

    return [
      ...Array.from({ length: placeholderCount }, (_, placeholderIndex) => ({
        key: `placeholder-${pageIndex}-${placeholderIndex}`,
        item: null,
        isPlaceholder: true,
      })),
      ...menuPage.map(item => ({ key: item.href, item, isPlaceholder: false })),
    ]
  }),
)

const pageCount = $derived(menuPages.length)
const activePageIndex = $derived.by(() => {
  const activeItemIndex = adminMenuItems.findIndex(item => isActive(item.href))

  if (activeItemIndex < 0) {
    return 0
  }

  return Math.floor(activeItemIndex / PAGE_SIZE)
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

function clearPageScrollLock(): void {
  if (pageScrollLockTimeout !== null) {
    clearTimeout(pageScrollLockTimeout)
    pageScrollLockTimeout = null
  }

  pageScrollLock = false
}

function clearInitialScrollTimeout(): void {
  if (initialScrollTimeout !== null) {
    clearTimeout(initialScrollTimeout)
    initialScrollTimeout = null
  }
}

function lockPageScroll(): void {
  clearPageScrollLock()
  pageScrollLock = true
  pageScrollLockTimeout = setTimeout(() => {
    pageScrollLock = false
    pageScrollLockTimeout = null
  }, PAGE_SCROLL_SETTLE_MS)
}

function getCurrentPageIndex(viewport: HTMLDivElement): number {
  const pageSize = isNarrow ? viewport.clientHeight : viewport.clientWidth
  const scrollOffset = isNarrow ? viewport.scrollTop : viewport.scrollLeft

  if (pageSize <= 0) {
    return 0
  }

  return Math.round(scrollOffset / pageSize)
}

function scrollToPage(pageIndex: number): void {
  if (!viewportElement) {
    return
  }

  const pageSize = isNarrow ? viewportElement.clientHeight : viewportElement.clientWidth
  const boundedIndex = Math.max(0, Math.min(pageIndex, pageCount - 1))

  viewportElement.scrollTo({
    top: isNarrow ? boundedIndex * pageSize : 0,
    left: isNarrow ? 0 : boundedIndex * pageSize,
    behavior: 'smooth',
  })
}

function handleViewportWheel(event: WheelEvent): void {
  if (
    !viewportElement ||
    pageCount <= 1 ||
    pageScrollLock ||
    !isScrollDetectionEnabled
  ) {
    return
  }

  const primaryDelta = isNarrow
    ? event.deltaY
    : Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY

  if (Math.abs(primaryDelta) < WHEEL_INTENT_THRESHOLD) {
    return
  }

  const currentPageIndex = getCurrentPageIndex(viewportElement)
  const nextPageIndex = primaryDelta > 0 ? currentPageIndex + 1 : currentPageIndex - 1
  const boundedNextPageIndex = Math.max(0, Math.min(nextPageIndex, pageCount - 1))

  if (boundedNextPageIndex === currentPageIndex) {
    event.preventDefault()
    return
  }

  event.preventDefault()
  lockPageScroll()
  scrollToPage(boundedNextPageIndex)
}

$effect(() => {
  if (!viewportElement) {
    return
  }

  if (pageCount <= 1) {
    clearInitialScrollTimeout()
    isScrollDetectionEnabled = true
    return
  }

  // Hold wheel-based page detection until the initial page alignment settles.
  isScrollDetectionEnabled = false
  lockPageScroll()
  scrollToPage(activePageIndex)
  clearInitialScrollTimeout()
  initialScrollTimeout = setTimeout(() => {
    isScrollDetectionEnabled = true
    initialScrollTimeout = null
  }, PAGE_SCROLL_SETTLE_MS)
})

$effect(() => {
  return () => {
    clearPageScrollLock()
    clearInitialScrollTimeout()
  }
})
</script>

<nav class={classes} aria-label="Admin menu">
  <div
    bind:this={viewportElement}
    class="bits-admin-menu__viewport"
    data-overflow={pageCount > 1 ? 'true' : undefined}
    onwheel={handleViewportWheel}
  >
    <div class="bits-admin-menu__track">
      {#each visibleMenuPages as menuPage, pageIndex (pageIndex)}
        <div class="bits-admin-menu__page">
          <div class="bits-admin-menu__list">
            {#each menuPage as entry (entry.key)}
              {#if entry.isPlaceholder}
                <div
                  class="bits-admin-menu__item bits-admin-menu__item--placeholder"
                ></div>
              {:else if entry.item}
                {@const active = isActive(entry.item.href)}
                {@const count = entry.item.notificationCount ?? 0}

                <div
                  class="bits-admin-menu__item"
                  data-active={active ? 'true' : undefined}
                  style={`--bits-admin-menu-active-color: var(--color-primary);`}
                >
                  <Button
                    text={entry.item.label}
                    iconComponent={entry.item.icon}
                    href={entry.item.href}
                    onClick={entry.item.onClick ?? undefined}
                    color="neutral"
                    style="ghost"
                    size="lg"
                    modifier="circle"
                    hideLabel={true}
                    hideLabelInstantly={true}
                    class="bits-admin-menu__button"
                    attrs={{
                      title: entry.item.label,
                      'aria-current': active ? 'page' : undefined,
                    }}
                  />

                  {#if count > 0}
                    <span
                      class="bits-admin-menu__badge"
                      class:bits-admin-menu__badge--accent={entry.item.tone === 'accent'}
                      class:bits-admin-menu__badge--overflow={count > 99}
                    >
                      {count > 99 ? '∞' : count}
                    </span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</nav>
