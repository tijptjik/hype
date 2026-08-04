<script lang="ts">
// SVELTE
import { page } from '$app/state'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
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
  if (!layerId && !projectId && !projectCode) return

  const resolvedProjectId =
    projectId ||
    appCtx.state.resources.project.find(project => project.code === projectCode)?.id ||
    ''
  const targetKey = `${layerId}:${resolvedProjectId}:${projectCode}:${appCtx.state.resources.layer.length}`
  if (appliedTarget === targetKey) return

  const selectedLayerIds = layerId
    ? appCtx.state.resources.layer
        .filter(layer => layer.id === layerId)
        .map(layer => layer.id)
    : appCtx.state.resources.layer
        .filter(layer => layer.projectId === resolvedProjectId)
        .map(layer => layer.id)

  if (selectedLayerIds.length === 0) return
  appliedTarget = targetKey

  // Select the requested layers before refreshing so the feature query is scoped to them.
  appCtx.state.prisms.layer = selectedLayerIds
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
