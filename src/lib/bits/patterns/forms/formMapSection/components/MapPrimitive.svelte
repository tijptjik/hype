<script lang="ts">
import LegacyMap from '$lib/components/common/Maplet.svelte'
import type { AddressMeta } from '$lib/types'

type Props = {
  coordinates: number[]
  initialCenter?: [number, number] | null
  addressMeta: AddressMeta | null
  draggable?: boolean
  onCoordinateChange?: (coordinates: number[]) => void
  onToggleFullscreen?: (isFullscreen: boolean) => void
  onToggleCollapsed?: (isCollapsed: boolean) => void
}

let {
  coordinates,
  initialCenter = null,
  addressMeta,
  draggable = false,
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
    {draggable}
    dragEndCallback={onCoordinateChange}
    toggleFullscreen={onToggleFullscreen}
    toggleCollapsed={onToggleCollapsed}
  />
</div>
