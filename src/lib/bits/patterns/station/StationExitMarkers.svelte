<script lang="ts">
// COMPONENTS
import ExitSign from './ExitSign.svelte'
// DATA
import { exitMarkers } from '#lib/indoor/exits.js'
// TYPES
import type { Place } from '#lib/indoor/model.js'
import type { StationProjection } from '#lib/indoor/scene.js'

let {
  entries,
  levelId,
  projection,
  textScale,
  selectedId,
  dragged,
  onSelectPlace,
}: {
  entries: Place[]
  levelId: string
  projection: StationProjection
  textScale: number
  selectedId?: string
  dragged: boolean
  onSelectPlace: (place: Place) => void
} = $props()
</script>

{#each exitMarkers(entries, levelId) as marker (marker.place.id)}
  {@const point = projection.project(marker.point, levelId)}
  <!-- biome-ignore lint/a11y/useSemanticElements: SVG markers also have keyboard-accessible directory entries. -->
  <g
    data-station-exit={marker.place.id}
    data-exit-label={marker.label}
    role="button"
    tabindex="0"
    aria-label={marker.place.name.en}
    class="cursor-pointer"
    onclick={event => {
      event.stopPropagation()
      if (!dragged) onSelectPlace(marker.place)
    }}
    onkeydown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        onSelectPlace(marker.place)
      }
    }}
  >
    <title>{marker.place.name.en}</title>
    <ExitSign
      label={marker.label}
      x={point[0]}
      y={point[1]}
      {textScale}
      selected={selectedId === marker.place.id}
    />
  </g>
{/each}
