<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
// DOMAIN
import { createDivisionHighlights } from '#lib/map/divisionHighlights.js'
import { divisionGeometryDetail } from '#lib/resources/divisionClient.js'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { DivisionGeometry } from '#lib/divisions/geometry.js'
import type {
  ResourceClient,
  ResourceDetail,
} from '#lib/resources/resourceClient.svelte.js'

/** On-demand overlay orchestration; native payload retention belongs to ResourceClient. */
let {
  map,
  client,
  selectedIds,
  hoveredId,
}: {
  map: MapLibreMap
  client: ResourceClient
  selectedIds: string[]
  hoveredId: string | null
} = $props()

let renderer = $state.raw<ReturnType<typeof createDivisionHighlights> | null>(null)
$effect(() => {
  const overlay = createDivisionHighlights(map)
  renderer = overlay
  return () => overlay.destroy()
})

// Retain handles for the active IDs; native queries remain the only payload cache.
const details = new SvelteMap<string, ResourceDetail<DivisionGeometry>>()
let loadedScope = ''
let loadedClient: ResourceClient | null = null
$effect(() => {
  const ids = new Set([...selectedIds, ...(hoveredId ? [hoveredId] : [])])
  const scope = client.scopeKey
  const currentClient = client
  untrack(() => {
    if (scope !== loadedScope || currentClient !== loadedClient) {
      for (const detail of details.values()) detail.release()
      details.clear()
      loadedScope = scope
      loadedClient = currentClient
    }
    for (const [id, detail] of details) {
      if (!ids.has(id)) {
        detail.release()
        details.delete(id)
      }
    }
    for (const id of ids) {
      if (details.has(id)) continue
      const detail = divisionGeometryDetail(currentClient, id)
      details.set(id, detail)
      void detail.load().catch(error => {
        if (details.get(id) === detail)
          console.error('[Division geometry] Loading failed', error)
      })
    }
  })
})

$effect(() => {
  const overlay = renderer
  const hovered = hoveredId
  const geometries = [...details.values()].flatMap(detail =>
    detail.data ? [detail.data] : [],
  )
  untrack(() => overlay?.update(geometries, hovered))
})

onDestroy(() => {
  for (const detail of details.values()) detail.release()
  details.clear()
})
</script>
