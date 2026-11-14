<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { untrack } from 'svelte'
// API
import { getTasks } from '#lib/api/tasks.remote.js'
// I18N
import * as m from '#lib/paraglide/messages.js'
// BITS COMPONENTS
import AdminMenuNavigation from './AdminMenuNavigation.svelte'
// LIB
import { ADMIN_PATH } from '#lib/index.js'
// AUTH
import { canViewAnalytics } from '#lib/client/services/auth.js'
import { canAccessAdminPanel } from '#lib/api/services/authz/user.js'
import { authorizeTaskListForContext } from '#lib/api/services/authz/task.js'
import { canBrowseUsers } from '#lib/api/services/authz/userDirectory.js'
// NAVIGATION
import { navigateOnAdmin } from '#lib/navigation/index.js'
import { messagingNavigationEnabled } from '#lib/navigation/releases.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// ICONS
import UsersIcon from 'virtual:icons/proicons/person-multiple'
import ChartColumnIncreasing from 'virtual:icons/proicons/bar-chart'
import CloudArrowUp from 'virtual:icons/proicons/cloud-arrow-up'
import BuildingLibrary from 'virtual:icons/proicons/bank'
import InboxArrowDown from 'virtual:icons/proicons/mail-open'
import MapPin from 'virtual:icons/proicons/location'
import StoreIcon from '#lib/bits/custom/icon/StoreIcon.svelte'
import ChatIcon from 'virtual:icons/proicons/chat'
import TemplateIcon from '#lib/bits/custom/icon/TemplateIcon.svelte'
import CatalogIcon from 'virtual:icons/proicons/book'
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import FieldResearchIcon from '#lib/bits/custom/icon/FieldResearchIcon.svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// TYPES
import type { SessionUser } from '#lib/types.js'
import type { AdminMenuItem, AdminMenuProps } from './adminMenu.types'

const adminCtx = getAdminCtx()
let { isNarrow }: AdminMenuProps = $props()

const canListTasks = $derived(
  Boolean(
    adminCtx.view.user &&
      authorizeTaskListForContext({
        user: adminCtx.view.user as SessionUser,
        userRoles: adminCtx.view.user.roles ?? [],
        isAdminRequest: true,
        resourceHubId: adminCtx.view.hub?.id,
      }).allowed,
  ),
)
// Navigation needs the server total even when the Tasks index has never been opened.
const taskCountQuery = $derived(
  canListTasks
    ? getTasks({
        conditions: {
          isReviewed: adminCtx.view.filters.viewFilters.task.isReviewed,
          type: adminCtx.view.filters.viewFilters.task.type,
        },
        prisms: adminCtx.view.scope.prisms,
        pagination: { limit: 1, offset: 0 },
        meta: { ...adminCtx.view.resources.queryMeta },
      })
    : null,
)
const notificationCount = $derived(
  canListTasks ? (taskCountQuery?.current?.totalCount ?? 0) : 0,
)
let previousTaskRows: unknown
// Task reviews refresh the queue rows; refresh the small badge query alongside that update.
$effect(() => {
  const rows = adminCtx.view.queries.rows.task
  const query = taskCountQuery
  const changed = previousTaskRows !== undefined && previousTaskRows !== rows
  previousTaskRows = rows
  if (changed && query)
    untrack(() => {
      void query.refresh().catch(() => {})
    })
})
const featureCount = $derived(adminCtx.featureIndexCount ?? 0)

// Index navigation preserves prisms; empty selections show all server-permitted resources.
const adminMenuItems = $derived.by((): AdminMenuItem[] => {
  const actor = adminCtx.view.user as SessionUser | null
  const directoryAllowed =
    actor &&
    canBrowseUsers({
      isAnonymous: actor.isAnonymous,
      superAdmin: actor.superAdmin,
      userRoles: actor.roles ?? [],
      hubId: adminCtx.view.hub?.id,
    })
  if (
    !actor ||
    actor.isAnonymous ||
    (!canAccessAdminPanel({
      superAdmin: actor.superAdmin,
      userRoles: actor.roles ?? [],
    }) &&
      !directoryAllowed)
  )
    return []

  const items: AdminMenuItem[] = []

  if (adminCtx.view.isSuperAdmin()) {
    items.push({
      href: `${ADMIN_PATH}/hubs`,
      label: 'Hubs',
      compactLabel: 'Hub',
      icon: BuildingLibrary,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.hub),
    })
  }

  // Review queue visibility follows the same scoped policy as its server query.
  if (canListTasks) {
    items.push({
      href: `${ADMIN_PATH}/tasks`,
      label: 'Tasks',
      compactLabel: 'Task',
      icon: InboxArrowDown,
      onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.task),
      notificationCount,
    })
  }

  items.push({
    href: `${ADMIN_PATH}/features`,
    label: 'Features',
    compactLabel: 'Feature',
    icon: MapPin,
    onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.feature),
    notificationCount: featureCount,
  })

  if (directoryAllowed) {
    items.push({
      href: '/admin/users',
      label: 'Users',
      compactLabel: 'User',
      icon: UsersIcon,
    })
  }

  items.push({
    href: `${ADMIN_PATH}/locations`,
    label: m.location_policy_tab(),
    compactLabel: 'Locs.',
    icon: StoreIcon,
    onClick: () => navigateOnAdmin(adminCtx, FirstClassResource.location),
  })

  if (canViewAnalytics(adminCtx.view.user as SessionUser)) {
    items.push({
      href: `${ADMIN_PATH}/analytics`,
      label: 'Analytics',
      compactLabel: 'Stats',
      icon: ChartColumnIncreasing,
    })
  }

  if (adminCtx.view.isSuperAdmin()) {
    items.push({
      href: `${ADMIN_PATH}/import`,
      label: 'Bulk Upload',
      compactLabel: 'Upload',
      icon: CloudArrowUp,
    })
  }

  if (adminCtx.view.user && !adminCtx.view.user.isAnonymous) {
    items.push({
      href: `${ADMIN_PATH}/templates`,
      label: m.display_templates_title(),
      compactLabel: 'Naming',
      icon: TemplateIcon,
    })
  }

  if (messagingNavigationEnabled) {
    items.push({ href: `${ADMIN_PATH}/messaging`, label: 'Messaging', icon: ChatIcon })
  }
  if (adminCtx.view.isSuperAdmin())
    items.push({ href: `${ADMIN_PATH}/docs`, label: 'Docs', icon: BookOpenIcon })

  if (
    adminCtx.view.isSuperAdmin() ||
    adminCtx.view.user?.roles?.some(
      role =>
        (role.type === 'project' && ['maintainer', 'owner'].includes(role.role)) ||
        (role.type === 'organisation' && role.role === 'owner') ||
        (role.type === 'hub' && role.role === 'admin'),
    )
  )
    items.push({
      href: `${ADMIN_PATH}/fieldresearch`,
      label: 'Field Research',
      compactLabel: 'Field\nWork',
      icon: FieldResearchIcon,
    })

  items.push({
    href: `${ADMIN_PATH}/catalogue`,
    label: 'Brand Catalog',
    compactLabel: 'Brand\nCatalog',
    icon: CatalogIcon,
  })

  return items
})
</script>

<AdminMenuNavigation items={adminMenuItems} {isNarrow} pathname={page.url.pathname} />
