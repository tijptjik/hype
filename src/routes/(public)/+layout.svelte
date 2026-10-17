<script lang="ts">
import 'svelte-maplibre-gl/vite'
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { page } from '$app/state'
import { goto } from '$app/navigation'
// CONTEXT
import { getRootCTX } from '#lib/context/root.svelte.js'
import { setAppCtx } from '#lib/context/app.svelte.js'
import { setDivisionCtx } from '#lib/context/division.svelte.js'
// SERVICES
import { getMapResourceDeepLinkLayerIds } from '#lib/client/services/mapResourceDeepLink.js'
import { isAuthEntryPath } from '#lib/auth/bootstrap.js'
import { m } from '#lib/i18n.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()
const root = getRootCTX()
const appCtx = setAppCtx(setDivisionCtx(), root.account, root.responsive, root.cacheCtx)
let bootstrapGeneration = 0
let error = $state<string | null>(null)
let retry = $state(0)

/**
 * Determines whether the current route can apply a map project or layer deep link.
 *
 * @returns Whether the route renders the public map shell.
 */
function canApplyMapResourceDeepLink(): boolean {
  return page.url.pathname === '/' || page.url.pathname.startsWith('/features/')
}

/**
 * Applies an initial map resource target and removes the consumed query parameters.
 *
 * @returns Nothing after the target selection and feature refresh settle.
 * @remarks This intentionally runs only at bootstrap. Subsequent prism changes do
 * not update the URL, so shared links establish an initial map state without
 * turning prism selection into continuously synchronized navigation state.
 */
async function applyInitialMapResourceDeepLink(): Promise<void> {
  if (!canApplyMapResourceDeepLink()) return

  const selectedLayerIds = getMapResourceDeepLinkLayerIds(
    page.url.searchParams,
    appCtx.state.resources.layer,
    appCtx.state.resources.project,
  )
  if (selectedLayerIds === null) return

  // Replace the initial hub selection with the explicit map resource target.
  appCtx.state.prisms.layer = selectedLayerIds

  try {
    if (selectedLayerIds.length === 0) {
      // Reconcile filters without replacing the explicit empty selection.
      await appCtx.postLayerMutation(false, false)
      // Remove bootstrap features when an explicit target could not resolve.
      appCtx.setSortedResourceState(FirstClassResource.feature, [])
    } else {
      await appCtx.postLayerMutation(false)
      await appCtx.refreshFeatures(false)
    }
  } catch (error) {
    console.error('[Map deep link] Failed to apply map resource target:', error)
  } finally {
    // Consume targeting parameters even if an optional feature refresh fails.
    const cleanUrl = new URL(page.url.href)
    cleanUrl.searchParams.delete('layerId')
    cleanUrl.searchParams.delete('projectId')
    cleanUrl.searchParams.delete('project')
    await goto(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {
      replace: true,
      reset: false,
    })
  }
}

// The root owns identity; this layout owns map loading and keyboard listeners.
appCtx.navigation.syncUrl(page.url, 'app')
$effect(() => appCtx.navigation.syncUrl(page.url, 'app'))

$effect(() => {
  retry
  const ready = root.ready
  const user = root.user
  const hub = root.hub
  if (!ready) return
  const generation = ++bootstrapGeneration
  untrack(() => {
    if (hub) appCtx.setHub(hub)
    appCtx.syncAccount()
    appCtx.isInitialised = false
    error = null
    // Screensaver resolves its own layer after hierarchy loading, avoiding a flash of default features.
    void appCtx
      .init(user?.id ?? null, page.url.pathname !== '/screensaver')
      .then(async () => {
        if (generation !== bootstrapGeneration) return
        if (!user && isAuthEntryPath(page.url.pathname))
          await appCtx.bootstrapPublicMapResources()
        await applyInitialMapResourceDeepLink()
      })
      .catch(reason => {
        if (generation === bootstrapGeneration) error = String(reason)
      })
  })
})

$effect(() => {
  appCtx.isMobile = root.responsive.window.width < 768
})

$effect(() => {
  appCtx.registerKeydownHandlers()
  return () => appCtx.unregisterKeydownHandlers()
})

onDestroy(() => {
  bootstrapGeneration++
  appCtx.unregisterKeydownHandlers()
  appCtx.dispose()
})
</script>

{#if error}
  <div role="alert" class="p-6">
    <p>{m.bootstrap__error()}</p>
    <button
      type="button"
      class="mt-4 rounded bg-base-content px-4 py-2 text-base-100"
      onclick={() => retry++}
    >
      {m.bootstrap__retry()}
    </button>
  </div>
{:else}
  {@render children()}
{/if}
