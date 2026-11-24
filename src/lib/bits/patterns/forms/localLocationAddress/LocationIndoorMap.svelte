<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import StationScene from '#lib/bits/patterns/station/StationScene.svelte'
import StationIndexes from '#lib/bits/patterns/station/StationIndexes.svelte'
import StationIdentity from '#lib/bits/patterns/station/StationIdentity.svelte'
// API
import { getBuildingInteriorPreview } from '#lib/api/locationInterior.remote.js'
// DOMAIN
import { StationState } from '#lib/indoor/station.svelte.js'
import { loadPremisesCatalogue } from '#lib/indoor/registry.js'
// TYPES
import type { LocationResource } from '#lib/locations/resource.js'
import type { MapController } from '#lib/map/controller.js'

let {
  source,
  locationId,
  contextMap,
  expanded = false,
}: {
  source: NonNullable<
    LocationResource['indoorSource'] | LocationResource['buildingInterior']
  >
  locationId: string
  contextMap: MapController | null
  expanded?: boolean
} = $props()
let scene = $state<StationState | null>(null)
let failed = $state(false)
let retry = $state(0)

// The context camera owns the initial pose; both surfaces then share bearing and tilt.
$effect(() => {
  const current = scene
  const controller = contextMap
  if (!current?.data || current.loading || !controller) return
  const syncFromContext = (): void => {
    const camera = controller.getCamera()
    if (!camera) return
    // The SVG projection rotates geometry, while MapLibre rotates the viewing heading.
    current.bearing = -camera.bearing
    if (current.exploded) current.tilt = camera.pitch
    else current.planTilt = camera.pitch
  }
  untrack(() => {
    controller.jumpTo({ zoom: 18 })
    syncFromContext()
  })
  return controller.onOrientationChange?.(() => untrack(syncFromContext))
})

$effect(() => {
  const current = scene
  const controller = contextMap
  if (!current?.data || current.loading || !controller) return
  const bearing = -current.bearing
  const pitch = current.exploded ? current.tilt : current.planTilt
  untrack(() => {
    const camera = controller.getCamera()
    if (!camera) return
    // Compare wrapped bearings to avoid feedback when MapLibre normalizes a full turn.
    const difference = ((((bearing - camera.bearing + 540) % 360) + 360) % 360) - 180
    if (Math.abs(difference) > 0.001 || Math.abs(pitch - camera.pitch) > 0.001)
      controller.jumpTo({ bearing, pitch })
  })
})

// Keep the admin preview independent of the public map's navigation and session.
$effect(() => {
  const target = source
  const partId = locationId
  const attempt = retry
  const next = new StationState(() => null, false)
  scene = null
  failed = false
  let cancelled = false
  async function load(): Promise<void> {
    if ('buildingId' in target) {
      const query = getBuildingInteriorPreview({
        locationId: target.buildingId,
        hash: target.hash,
      })
      if (attempt) await query.refresh()
      const data = await query
      if (cancelled) return
      next.loadDraft(data)
      // Match only saved canonical associations. Unmapped parts open the building's default floor.
      const unit = next.entries.find(
        entry => entry.feature.properties.canonical_location_id === partId,
      )
      const level = data.level_polygon.features.find(
        feature => feature.properties.canonical_location_id === partId,
      )
      if (unit) next.select(unit)
      else if (level) next.openFloor(String(level.properties.level_id))
    } else {
      const catalogue = await loadPremisesCatalogue()
      if (cancelled) return
      const map = catalogue.find(entry => entry.id === target.mapId)
      if (!map) throw new Error('Indoor map unavailable')
      await next.open(map.code, target.polygonId, false)
    }
    if (cancelled) return
    if (next.error || !next.data) throw new Error('Indoor map unavailable')
    const { floor, selected, exploded } = next
    restoreSelection = () => {
      next.openFloor(floor)
      if (selected) next.select(selected)
      next.exploded = exploded
    }
    scene = next
  }
  void load().catch(() => {
    if (!cancelled) failed = true
  })
  return () => {
    cancelled = true
    untrack(() => next.close(false))
  }
})
// Collapsing returns the preview to the profile's own building part.
let restoreSelection: () => void = () => {}
$effect(() => {
  if (!expanded && scene) untrack(restoreSelection)
})
</script>

<!-- Use the public indoor canvas token so legend backgrounds blend in every theme. -->
<div
  class="relative h-full w-full bg-[var(--station-canvas)] select-none [&_*]:select-none"
  data-location-indoor-canvas
>
  {#if failed}
    <div class="flex h-full items-center justify-center p-4">
      <button
        type="button"
        class="text-primary text-sm underline"
        onclick={() => retry++}
      >
        Retry indoor map
      </button>
    </div>
  {:else if scene?.data && !scene.loading}
    <StationScene
      station={scene}
      data={scene.data}
      allowSelection={expanded}
      onSelect={() => {}}
    />
    {#if expanded}
      <StationIdentity station={scene} standalone />
      <StationIndexes
        station={scene}
        legend={{
          data: scene.data,
          entries: scene.entries,
          isBuilding: scene.isBuilding,
          exploded: scene.exploded,
          floor: scene.floor,
        }}
      />
    {/if}
  {:else}
    <div
      class="h-full w-full"
      role="status"
      aria-label="Loading indoor map"
      aria-busy="true"
    >
      <ContentSkeleton
        ><div
          class="bg-foreground/10 h-full min-h-48 w-full motion-safe:animate-pulse"
        ></div></ContentSkeleton
      >
    </div>
  {/if}
</div>
