<script lang="ts">
// SVELTE
import { afterNavigate, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Sidebar from '$lib/components/panels/Admin.svelte'
import Settings from '$lib/components/panels/Settings.svelte'
// BITS
import { AdminShell } from '$lib/bits'
// ADAPTERS
import { useAdminHeaderModel } from '$lib/adapters/header'
// NAVIGATION
import {
  resetAdminIndexResourceRef,
  shouldClearAdminFeatureCacheOnNavigate,
} from '$lib/navigation'
// CONTEXT
import { setAdminCtx } from '$lib/context/admin.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { setHeaderCtrl } from '$lib/context/header.svelte'
// ENUMS
import { Panel } from '$lib/enums'
import MonitorIcon from 'virtual:icons/lucide/monitor'
// TYPES
import type { LayoutProps, LayoutData } from './$types'
import type { QueryClient } from '@tanstack/svelte-query'

type AdminRootProps = LayoutProps & {
  children: () => unknown
  data: LayoutData & {
    queryClient: QueryClient
  }
}

// PROPS
let { children, data }: AdminRootProps = $props()

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx()

// CONTEXT :: ADMIN
// svelte-ignore state_referenced_locally
const adminCtx = setAdminCtx(data.queryClient, appCtx)
setHeaderCtrl()
const headerModel = useAdminHeaderModel(appCtx, adminCtx)
const headerProps = $derived(headerModel.getHeaderProps())
const adminPreferences = $derived(appCtx.getUserPreferences().admin)
const isPrimaryPanelAutoHide = $derived(
  appCtx.isAdmin() && (adminPreferences?.isPrimaryPanelAutoHide ?? false),
)

// Initialize AdminCtx if AppCtx is ready
$effect(() => {
  appCtx.isInitialised
  if (appCtx.isInitialised && !adminCtx.isInitialised) {
    adminCtx.init()
  }
})

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to }) => {
  if (shouldClearAdminFeatureCacheOnNavigate(from?.route.id, to?.route.id)) {
    appCtx.clearFeatureCacheImages()
  }
})

// NAVIGATION :: Reset activeResourceRef when navigating to index pages
afterNavigate(() => {
  if (!adminCtx.isInitialised) return
  resetAdminIndexResourceRef(adminCtx, page.url.pathname)
})
</script>

<AdminShell
  minWidth={1200}
  title={m.admin__desktop_only_window_too_small()}
  description={m.admin__desktop_only_window_too_small_explainer()}
  widthLabel={m.admin__desktop_only_current_width()}
  icon={MonitorIcon}
  isReady={adminCtx.isInitialised && appCtx.isInitialised}
  {isPrimaryPanelAutoHide}
  isAdminPanelOpen={appCtx.isPanelOpen(Panel.admin)}
  onOpenVisual={() => appCtx.openPanelVisually(Panel.admin)}
  onCloseVisual={() => appCtx.closePanelVisually(Panel.admin)}
  {headerProps}
>
  {#snippet sidebar()}
    <Sidebar />
  {/snippet}

  {#snippet settings()}
    <Settings />
  {/snippet}

  {@render children()}
</AdminShell>
