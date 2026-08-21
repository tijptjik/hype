<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// SVELTEKIT
import { page } from '$app/state'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// API
import { getMapResourceDeepLinkLayerIds } from '$lib/client/services/mapResourceDeepLink'
// COMPONENTS
import FlightSurface from '$lib/bits/patterns/layout/app/components/FlightSurface.svelte'

const appCtx = getAppCtx()
let appliedTarget = $state<string | null>(null)
const DEFAULT_FLIGHT_TIME_SECONDS = 120

const getFlightTimeMs = (): number => {
  const value = Number(page.url.searchParams.get('flightTime'))
  return Number.isFinite(value) && value > 0
    ? value * 1000
    : DEFAULT_FLIGHT_TIME_SECONDS * 1000
}

const flightTimeMs = $derived(getFlightTimeMs())

$effect(() => {
  if (!appCtx.isInitialised || !appCtx.user) return

  const layerId = page.url.searchParams.get('layerId')?.trim() ?? ''
  const projectId = page.url.searchParams.get('projectId')?.trim() ?? ''
  const projectCode = page.url.searchParams.get('project')?.trim() ?? ''

  const resolvedProjectId =
    projectId ||
    appCtx.state.resources.project.find(project => project.code === projectCode)?.id ||
    ''
  const targetKey = `${layerId}:${resolvedProjectId}:${projectCode}`
  if (untrack(() => appliedTarget) === targetKey) return

  const selectedLayerIds =
    getMapResourceDeepLinkLayerIds(
      page.url.searchParams,
      appCtx.state.resources.layer,
      appCtx.state.resources.project,
    ) ?? []

  appliedTarget = targetKey

  // Keep the base map empty until a valid explicit screensaver target resolves.
  appCtx.state.prisms.layer = selectedLayerIds
  if (selectedLayerIds.length === 0) return

  // Select the requested layers before refreshing so the feature query is scoped to them.
  void appCtx
    .postLayerMutation(false)
    .then(() => appCtx.refreshFeatures())
    .catch(error => {
      console.error('[Screensaver] Failed to apply screensaver layers:', error)
      appliedTarget = null
    })
})
</script>

<FlightSurface {flightTimeMs} />
