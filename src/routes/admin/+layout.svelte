<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
// EMBED SHARING
import ShareIcon from 'virtual:icons/proicons/share'
import { navigateOnAdmin } from '#lib/navigation/admin.js'
import type { HeaderButtonActionConfig } from '#lib/bits/patterns/layout/header/header.types.js'
import Deferred from '#lib/bits/custom/deferred/Deferred.svelte'
import { getEmbedResources } from '#lib/api/embed.remote.js'
import { resolveEmbedTargetId } from '#lib/embed/target.js'
import type { EmbedLayer } from '#lib/embed/embed.types.js'
import { page } from '$app/state'
// AUTH
import { canAccessAdminPanel } from '#lib/api/services/authz/user.js'
// TANSTACK
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import ResourcePanel from '#lib/bits/patterns/resourcePanel/ResourcePanel.svelte'
import { useResourcePanelModel } from '#lib/adapters/panels/useResourcePanelModel.svelte.js'
import AdminMenu from '#lib/bits/patterns/bars/adminMenu/AdminMenu.svelte'
// BITS
import AdminShell from '#lib/bits/patterns/layout/app/components/AdminShell.svelte'
// ADAPTERS
import { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { useAdminHeaderModel } from '#lib/adapters/header/index.js'
// NAVIGATION
import { getAdminMapHref } from '#lib/navigation/adminMapLink.js'
import {
  resetAdminIndexResourceRef,
  shouldClearAdminFeatureCacheOnNavigate,
} from '#lib/navigation/index.js'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { getRootCTX } from '#lib/context/root.svelte.js'
import { setDivisionCtx } from '#lib/context/division.svelte.js'
import { resourceProviders } from '#lib/resources/providers.js'
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'
import MonitorIcon from 'virtual:icons/proicons/computer'
// TYPES
import type { LayoutProps, LayoutData } from './$types'

type AdminRootProps = LayoutProps & {
  children: () => unknown
  data: LayoutData & {}
}

// PROPS
let { children, data }: AdminRootProps = $props()

// CONTEXT :: APP
// Admin owns its resource view; it never constructs the public AppCtx.
const root = getRootCTX()
const hasAdminAccess = $derived(
  Boolean(
    root.user &&
      root.user.isAnonymous !== true &&
      canAccessAdminPanel({
        superAdmin: root.user.superAdmin,
        userRoles: root.user.roles ?? [],
      }),
  ),
)
root.cacheCtx.installProviders(resourceProviders)
const view = setSurfaceCtx(
  new ResourceViewCtx(
    setDivisionCtx(),
    root.account,
    root.responsive,
    root.cacheCtx,
    'admin',
  ),
)

$effect(() => {
  const user = root.user
  const hub = root.hub
  if (!root.ready) return
  if (!hasAdminAccess) {
    void goto('/', { replaceState: true })
    return
  }
  untrack(() => {
    if (hub) view.setHub(hub)
    view.syncAccount()
    adminCtx.isInitialised = false
    void view.init(user?.id ?? null)
  })
})

// Native admin feature payloads remain reactive during optimistic edits.
$effect(() => {
  const query = root.cacheCtx.featureCollection
  const current = query?.current
  view.resources.scopeKey
  if (current && adminCtx.featureIndexReady) {
    untrack(() => adminCtx.syncFeatureCollection(query, current))
  }
})

onDestroy(() => {
  view.dispose()
})

// CONTEXT :: ADMIN
// svelte-ignore state_referenced_locally
const adminCtx = setAdminCtx(view)
// Shallow facet navigation changes the visible URL without replacing page.url.
adminCtx.navigation.syncUrl(page.shallow?.url ?? page.url, 'admin')
$effect(() => adminCtx.navigation.syncUrl(page.shallow?.url ?? page.url, 'admin'))

const themeModel = getThemeModel()
const settingsModel = useSettingsPanelModel(view, themeModel, adminCtx)

type SettingsPanelComponent =
  typeof import('#lib/bits/patterns/settingsPanel/SettingsPanel.svelte').default

let SettingsPanel = $state<SettingsPanelComponent | null>(null)
let settingsPanelLoadError = $state<unknown>(null)
let settingsPanelPromise: Promise<SettingsPanelComponent> | null = null

/**
 * Loads and retains the admin settings panel for background preload or first open.
 *
 * @returns The shared in-flight or loaded settings component.
 * @remarks Failed imports are cleared so opening the panel or retrying can recover.
 */
function loadSettingsPanel(): Promise<SettingsPanelComponent> {
  settingsPanelPromise ??= import(
    '#lib/bits/patterns/settingsPanel/SettingsPanel.svelte'
  )
    .then(module => {
      SettingsPanel = module.default
      settingsPanelLoadError = null

      return module.default
    })
    .catch(error => {
      settingsPanelPromise = null
      settingsPanelLoadError = error

      throw error
    })

  return settingsPanelPromise
}

$effect(() => {
  if (settingsModel.open) void loadSettingsPanel().catch(() => {})
})

// Preload settings after admin initialization without blocking the initial render.
$effect(() => {
  if (!view.isInitialised || !adminCtx.isInitialised) return

  const preload = (): void => {
    void loadSettingsPanel().catch(() => {})
  }

  if (typeof window.requestIdleCallback === 'function') {
    const callback = window.requestIdleCallback(preload, { timeout: 1000 })
    return () => window.cancelIdleCallback(callback)
  }

  const timeout = window.setTimeout(preload, 0)
  return () => window.clearTimeout(timeout)
})

const sidebarModel = useResourcePanelModel(view, 'admin', adminCtx)

const headerCtrl = setHeaderCtrl()

const headerModel = useAdminHeaderModel(view, adminCtx)
let visitedShareTarget = $state('')
const shareType = $derived(adminCtx.activeResourceType)
// Detail pages own native queries; the share entry must not depend on the legacy cache.
const shareTarget = $derived(
  shareType &&
    ['hub', 'organisation', 'project', 'layer'].includes(shareType) &&
    adminCtx.activeResourceRef &&
    adminCtx.activeResourceRef !== 'new'
    ? adminCtx.activeResourceRef
    : null,
)
const shareKey = $derived(`${shareType}:${shareTarget}`)
const shareAccessKey = $derived(
  JSON.stringify([
    shareKey,
    root.user?.id,
    root.user?.superAdmin,
    root.user?.roles,
    root.hub,
  ]),
)
let shareAccess = $state<{ key: string; rows: EmbedLayer[] } | null>(null)
const shareAccessReady = $derived(shareAccess?.key === shareAccessKey)
const canShare = $derived(
  Boolean(
    hasAdminAccess &&
      shareAccessReady &&
      shareType &&
      shareTarget &&
      resolveEmbedTargetId(shareAccess!.rows, shareType, shareTarget),
  ),
)
const isShareFacet = $derived(adminCtx.activeFacet === 'share')

// Resolve access from the server-filtered catalogue and discard stale navigation results.
$effect(() => {
  const key = shareAccessKey
  if (!root.ready || !hasAdminAccess || !shareTarget) return
  let cancelled = false
  void getEmbedResources({ meta: { isAdminRequest: true } }).then(
    rows => {
      if (!cancelled) shareAccess = { key, rows }
    },
    () => {
      if (!cancelled) shareAccess = { key, rows: [] }
    },
  )
  return () => {
    cancelled = true
  }
})

// Hash navigation is client-owned: deny direct bookmarks as well as shallow navigation.
$effect(() => {
  if (
    root.ready &&
    hasAdminAccess &&
    isShareFacet &&
    (!shareTarget || (shareAccessReady && !canShare))
  ) {
    void goto('/admin', { replaceState: true })
  }
})
// Keep the builder mounted across tab changes, but never carry choices to another resource.
$effect(() => {
  if (isShareFacet && canShare) visitedShareTarget = shareKey
})
const baseHeaderProps = $derived(headerModel.getHeaderProps())
const shareAction = $derived<HeaderButtonActionConfig | null>(
  canShare
    ? {
        text: 'Share map',
        icon: ShareIcon,
        style: isShareFacet ? 'soft' : 'outline',
        color: isShareFacet ? 'primary' : 'neutral',
        attrs: { 'aria-pressed': isShareFacet },
        onClick: () => {
          if (canShare && shareType && shareTarget)
            void navigateOnAdmin(adminCtx, shareType, shareTarget, 'share')
        },
      }
    : null,
)
const headerProps = $derived({
  ...baseHeaderProps,
  shareAction,
  facets: {
    ...baseHeaderProps.facets,
    items: baseHeaderProps.facets?.items?.filter(item => item.ref !== 'share'),
  },
  // Sharing has its own controls; keep resource form actions on their editing tabs.
  ...(isShareFacet
    ? {
        formActions: {
          ...baseHeaderProps.formActions,
          isVisible: false,
          primaryAction: null,
          saveAction: null,
          deleteAction: null,
          publishAction: null,
          previewAction: null,
        },
        controlBar: null,
        footer: null,
      }
    : {}),
  brand: {
    src: '/logos/hype-mark.svg',
    alt: 'HYPE',
    monochrome: true,
    href: getAdminMapHref(
      view.scope.prisms,
      adminCtx.activeResourceType,
      adminCtx.activeResourceRef,
      adminCtx.activeResourceType === 'task' && adminCtx.activeResourceRef
        ? view.cache.task.get(adminCtx.activeResourceRef)
        : null,
      adminCtx.activeResourceType === 'feature' && adminCtx.activeResourceRef
        ? view.cache.feature.get(adminCtx.activeResourceRef)
        : null,
    ),
    // Dispose admin retention before entering an authorized publication preview.
    reload:
      adminCtx.activeResourceType === 'feature' &&
      Boolean(
        adminCtx.activeResourceRef &&
          view.cache.feature.get(adminCtx.activeResourceRef)?.isPublished === false,
      ),
    label: 'HYPE — Back to map',
  },
})
const adminPreferences = $derived(view.getUserPreferences().admin)
const isPrimaryPanelAutoHide = $derived(
  view.isAdmin() && (adminPreferences?.isPrimaryPanelAutoHide ?? false),
)

let failedAdminScope = $state<string | null>(null)

// Initialize AdminCtx if AppCtx is ready; a failed scope must not retry on loading changes.
$effect(() => {
  const user = root.user
  const scope = view.resources.scopeKey
  if (!root.ready || !user || !hasAdminAccess) return
  if (
    view.isInitialised &&
    !adminCtx.isInitialised &&
    !adminCtx.isInitializing &&
    failedAdminScope !== scope
  ) {
    void adminCtx.init().catch(error => {
      // Ignore failures from an account scope that has already been replaced.
      if (scope !== view.resources.scopeKey) return
      failedAdminScope = scope
      // Resource failures do not determine panel access; the session guard owns redirects.
      console.error('[AdminLayout] Failed to initialize admin context', error)
    })
  }
})

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to, shallow }) => {
  if (shallow) return

  if (shouldClearAdminFeatureCacheOnNavigate(from?.route.id, to?.route.id)) {
    view.clearFeatureCacheImages()
  }
})

// NAVIGATION :: Reset activeResourceRef when navigating to index pages
afterNavigate(({ shallow }) => {
  if (!shallow) headerCtrl.isSearchFocused = false
  if (shallow) return
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
  isReady={adminCtx.isInitialised && view.isInitialised}
  {isPrimaryPanelAutoHide}
  isAdminPanelOpen={view.panels.isPanelOpen(Panel.admin)}
  onOpenVisual={() => view.panels.openPanelVisually(Panel.admin)}
  onCloseVisual={() => view.panels.closePanelVisually(Panel.admin)}
  {headerProps}
>
  {#snippet sidebar()}
    <ResourcePanel model={sidebarModel}
      >{#snippet footer()}
        <AdminMenu isNarrow={sidebarModel.panel.isNarrow} />
      {/snippet}</ResourcePanel
    >
  {/snippet}

  {#snippet settings()}
    {#if SettingsPanel}
      <SettingsPanel model={settingsModel} />
    {:else if settingsModel.open}
      <div
        class="bits-theme bg-panel flex h-full w-[380px] max-w-full shrink-0 items-center justify-center shadow-xl"
        role="status"
        aria-label={m.resource_loading()}
      >
        {#if settingsPanelLoadError}
          <div class="max-w-xs p-6 text-center">
            <p>{m.bootstrap__error()}</p>
            <button
              type="button"
              class="bg-base-content text-base-100 mt-4 rounded-lg px-4 py-2"
              onclick={() => void loadSettingsPanel().catch(() => {})}
            >
              {m.bootstrap__retry()}
            </button>
          </div>
        {:else}
          <span class="loading loading-ring loading-lg" aria-hidden="true"></span>
          <span class="sr-only">{m.resource_loading()}</span>
        {/if}
      </div>
    {/if}
  {/snippet}

  <div class={isShareFacet ? 'hidden' : 'contents'}>
    {@render children()}
  </div>
  {#key shareKey}
    {#if canShare && shareTarget && shareType && visitedShareTarget === shareKey}
      <div class={isShareFacet ? 'h-full min-h-0 w-full' : 'hidden'}>
        <Deferred
          load={() => import('#lib/bits/patterns/embed/ShareEmbedPanel.svelte')}
        >
          {#snippet children(module)}
            <module.default
              initialTheme={themeModel.selected}
              initialMapStyle={themeModel.resolvedMapStyle}
              targetType={shareType}
              targetId={shareTarget}
              loadResources={async () =>
                await getEmbedResources({ meta: { isAdminRequest: true } })}
            />
          {/snippet}
        </Deferred>
      </div>
    {/if}
  {/key}
</AdminShell>
