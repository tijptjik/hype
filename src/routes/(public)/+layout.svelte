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
// PUBLICATION
import { parsePublicationPreview } from '#lib/publication/preview.js'
import { getPublicationPreview } from '#lib/api/publicationPreview.remote.js'
// SERVICES
import { getMapPrisms, MAP_PRISM_PARAMS } from '#lib/navigation/adminMapLink.js'
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
// Entry and exit use full navigation so public and private map retention cannot overlap.
try {
  appCtx.view.publicationPreview = parsePublicationPreview(page.url.searchParams)
} catch (reason) {
  error = String(reason)
}
const preview = $derived(appCtx.view.publicationPreview)
let previewExitRef = $state('')
const previewExitUrl = $derived(
  preview
    ? `/admin/${preview.type}s${previewExitRef ? `/${encodeURIComponent(previewExitRef)}` : ''}`
    : '/',
)

/**
 * Checks preview access before bootstrapping any map data.
 * @param userId Current account identity.
 * @returns Completion of ordinary map initialization after preview authorization.
 */
async function initializeMap(userId: string | null): Promise<void> {
  if (appCtx.view.publicationPreview) {
    const request = getPublicationPreview(appCtx.view.publicationPreview)
    await request.refresh()
    const target = await request
    previewExitRef = target.ref
    appCtx.publicationPreviewExitUrl = `/admin/${appCtx.view.publicationPreview.type}s/${encodeURIComponent(target.ref)}`
  }
  await appCtx.init(userId, page.url.pathname !== '/screensaver')
}

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
  if (!canApplyMapResourceDeepLink() || appCtx.view.publicationPreview) return

  const transferredPrisms = getMapPrisms(page.url.searchParams)
  if (transferredPrisms) {
    // Refresh hierarchy under the incoming scope before resolving visible map layers.
    appCtx.view.scope.prisms = transferredPrisms
    await appCtx.view.queries.refreshProjects(false)
    await appCtx.view.queries.refreshLayers(false, false)
    if (transferredPrisms.layer.length === 0) {
      appCtx.view.scope.prisms.layer = appCtx.view.queries.rows.layer.map(
        layer => layer.id,
      )
    }
    await appCtx.view.postLayerMutation(false, false)
    await appCtx.view.queries.refreshFeatures(false)
    const cleanUrl = new URL(page.url.href)
    for (const key of ['mapPrisms', ...MAP_PRISM_PARAMS]) {
      cleanUrl.searchParams.delete(key)
    }
    await goto(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {
      replace: true,
      reset: false,
    })
    return
  }

  const selectedLayerIds = getMapResourceDeepLinkLayerIds(
    page.url.searchParams,
    appCtx.view.queries.rows.layer,
    appCtx.view.queries.rows.project,
  )
  if (selectedLayerIds === null) return

  // Replace the initial hub selection with the explicit map resource target.
  appCtx.view.scope.prisms.layer = selectedLayerIds

  try {
    if (selectedLayerIds.length === 0) {
      // Reconcile filters without replacing the explicit empty selection.
      await appCtx.view.postLayerMutation(false, false)
      // Remove bootstrap features when an explicit target could not resolve.
      appCtx.view.setSortedResourceState(FirstClassResource.feature, [])
    } else {
      await appCtx.view.postLayerMutation(false)
      await appCtx.view.queries.refreshFeatures(false)
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
// Shallow facet navigation changes the visible URL without replacing page.url.
appCtx.navigation.syncUrl(page.shallow?.url ?? page.url, 'app')
$effect(() => appCtx.navigation.syncUrl(page.shallow?.url ?? page.url, 'app'))

$effect(() => {
  retry
  const ready = root.ready
  const user = root.user
  const hub = root.hub
  if (!ready) return
  const generation = ++bootstrapGeneration
  untrack(() => {
    if (hub) appCtx.view.setHub(hub)
    appCtx.view.syncAccount()
    appCtx.view.isInitialised = false
    error = null
    try {
      parsePublicationPreview(page.url.searchParams)
    } catch (reason) {
      error = String(reason)
      return
    }
    // Screensaver resolves its own layer after hierarchy loading, avoiding a flash of default features.
    void initializeMap(user?.id ?? null)
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
  appCtx.view.isMobile = root.responsive.window.width < 768
})

$effect(() => {
  appCtx.view.interactions.registerKeydownHandlers()
  return () => appCtx.view.interactions.unregisterKeydownHandlers()
})

onDestroy(() => {
  bootstrapGeneration++
  appCtx.view.interactions.unregisterKeydownHandlers()
  appCtx.dispose()
})
</script>

{#if error}
  <div role="alert" class="p-6">
    <p>{preview ? m.publication_preview__unavailable() : m.bootstrap__error()}</p>
    {#if preview}
      <p class="mt-2 text-sm">
        {m.publication_preview__access_error()}
      </p>
      <a href={previewExitUrl} data-sveltekit-reload class="mt-4 inline-block underline"
        >{m.publication_preview__exit()}</a
      >
    {/if}
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
