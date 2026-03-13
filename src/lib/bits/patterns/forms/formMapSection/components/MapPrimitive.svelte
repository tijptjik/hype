<script lang="ts">
import LegacyMap from '$lib/components/common/Map.svelte'
import type { AddressMeta } from '$lib/types'

type Props = {
  coordinates: number[]
  initialCenter?: [number, number] | null
  addressMeta: AddressMeta | null
  onCoordinateChange?: (coordinates: number[]) => void
  onToggleFullscreen?: (isFullscreen: boolean) => void
  onToggleCollapsed?: (isCollapsed: boolean) => void
}

let {
  coordinates,
  initialCenter = null,
  addressMeta,
  onCoordinateChange,
  onToggleFullscreen,
  onToggleCollapsed,
}: Props = $props()
</script>

<div class="bits-feature-map">
  <LegacyMap
    {coordinates}
    {initialCenter}
    {addressMeta}
    draggable={true}
    dragEndCallback={onCoordinateChange}
    toggleFullscreen={onToggleFullscreen}
    toggleCollapsed={onToggleCollapsed}
  />
</div>
