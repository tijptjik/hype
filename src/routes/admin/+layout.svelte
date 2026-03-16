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
import { AutoHide, Header, MinWidthGuard } from '$lib/bits'
import type { HeaderProps } from '$lib/bits'
// ADAPTERS
import { useAdminHeaderModel } from '$lib/adapters/header'
// CONTEXT
import { setAdminCtx } from '$lib/context/admin.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { setHeaderCtrl } from '$lib/context/header.svelte'
// ENUMS
import { FirstClassResource, Panel, ResourcePath } from '$lib/enums'
import MonitorIcon from 'virtual:icons/lucide/monitor'
// TYPES
import type { LayoutProps, LayoutData } from './$types'
import type { QueryClient } from '@tanstack/svelte-query'
import type { NavigableResource } from '$lib/types'

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
const adminCtx = setAdminCtx(data.queryClient, appCtx)
setHeaderCtrl()
const headerModel = useAdminHeaderModel(appCtx, adminCtx)
const headerProps = $derived(headerModel.getHeaderProps())
const resolvedHeaderProps = $derived({
  ...headerProps,
  id: headerProps.id ?? undefined,
})
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
  if (!from || !to) return

  const fromIsAdmin = from.route.id?.startsWith('/admin')
  const toIsAdmin = to.route.id?.startsWith('/admin')

  // Clear feature cache images when switching between admin and user apps
  if (fromIsAdmin !== toIsAdmin) {
    appCtx.clearFeatureCacheImages()
  }
})

// NAVIGATION :: Reset activeResourceRef when navigating to index pages
afterNavigate(() => {
  if (!adminCtx.isInitialised) return

  const pathname = page.url.pathname

  // Check if we're on an index page (no specific resource ref)
  const isIndexPage = Object.values(ResourcePath).some(
    path => pathname === `/admin/${path}` || pathname === `/admin/${path}/`,
  )

  if (isIndexPage && adminCtx.activeResourceRef !== false) {
    // Extract resource type from path
    const resourceType = Object.entries(ResourcePath).find(([_, path]) =>
      pathname.includes(`/admin/${path}`),
    )?.[0] as FirstClassResource

    if (resourceType) {
      adminCtx.setResourceRef(false, resourceType as NavigableResource)
    }
  }
})
</script>

<!-- LAYOUT -->
<MinWidthGuard
  minWidth={1024}
  title={m.admin__desktop_only_window_too_small()}
  description={m.admin__desktop_only_window_too_small_explainer()}
  widthLabel={m.admin__desktop_only_current_width()}
  icon={MonitorIcon}
>
  {#if adminCtx.isInitialised && appCtx.isInitialised}
    <div class="flex h-full w-full overflow-hidden drag-none">
      <AutoHide
        enabled={isPrimaryPanelAutoHide}
        isOpen={appCtx.isPanelOpen(Panel.admin)}
        onOpenVisual={() => appCtx.openPanelVisually(Panel.admin)}
        onCloseVisual={() => appCtx.closePanelVisually(Panel.admin)}
      >
        <Sidebar />
      </AutoHide>
      <main
        class="flex h-full flex-1 flex-col overflow-hidden bg-linear-to-bl from-rose-500 to-fuchsia-800 bg-fixed"
      >
        <Header {...(resolvedHeaderProps as HeaderProps)} />
        {@render children()}
        {#if headerProps.footer?.component}
          {@const Footer = headerProps.footer.component}
          <Footer {...(headerProps.footer.props ?? {})} />
        {/if}
      </main>
      <Settings />
    </div>
  {:else}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="loading loading-ring loading-lg"></div>
    </div>
  {/if}
</MinWidthGuard>
