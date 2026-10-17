<script lang="ts">
// SVELTE
import { afterNavigate, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
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
import {
  resetAdminIndexResourceRef,
  shouldClearAdminFeatureCacheOnNavigate,
} from '#lib/navigation/index.js'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { getAppCtx } from '#lib/context/app.svelte.js'
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
// Get the shared AppCtx from root layout
const appCtx = getAppCtx()

// CONTEXT :: ADMIN
// svelte-ignore state_referenced_locally
const adminCtx = setAdminCtx(appCtx)

const settingsModel = useSettingsPanelModel(appCtx, getThemeModel(), adminCtx)

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
  if (!appCtx.isInitialised || !adminCtx.isInitialised) return

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

const sidebarModel = useResourcePanelModel(appCtx, 'admin', adminCtx)

setHeaderCtrl()

const headerModel = useAdminHeaderModel(appCtx, adminCtx)
const headerProps = $derived({
  ...headerModel.getHeaderProps(),
  brand: {
    src: '/logos/hype-mark.svg',
    alt: 'HYPE',
    monochrome: true,
    href: '/',
    label: 'HYPE — Back to map',
  },
})
const adminPreferences = $derived(appCtx.getUserPreferences().admin)
const isPrimaryPanelAutoHide = $derived(
  appCtx.isAdmin() && (adminPreferences?.isPrimaryPanelAutoHide ?? false),
)

// Initialize AdminCtx if AppCtx is ready
$effect(() => {
  appCtx.isInitialised
  if (appCtx.isInitialised && !adminCtx.isInitialised && !adminCtx.isInitializing) {
    void adminCtx.init().catch(error => {
      console.error('[AdminLayout] Failed to initialize admin context', error)
    })
  }
})

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to, shallow }) => {
  if (shallow) return

  if (shouldClearAdminFeatureCacheOnNavigate(from?.route.id, to?.route.id)) {
    appCtx.clearFeatureCacheImages()
  }
})

// NAVIGATION :: Reset activeResourceRef when navigating to index pages
afterNavigate(({ shallow }) => {
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
  isReady={adminCtx.isInitialised && appCtx.isInitialised}
  {isPrimaryPanelAutoHide}
  isAdminPanelOpen={appCtx.isPanelOpen(Panel.admin)}
  onOpenVisual={() => appCtx.openPanelVisually(Panel.admin)}
  onCloseVisual={() => appCtx.closePanelVisually(Panel.admin)}
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
        class="bits-theme flex h-full w-[380px] max-w-full shrink-0 items-center justify-center bg-panel shadow-xl"
        role="status"
        aria-label={m.resource_loading()}
      >
        {#if settingsPanelLoadError}
          <div class="max-w-xs p-6 text-center">
            <p>{m.bootstrap__error()}</p>
            <button
              type="button"
              class="mt-4 rounded-lg bg-base-content px-4 py-2 text-base-100"
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

  {@render children()}
</AdminShell>
