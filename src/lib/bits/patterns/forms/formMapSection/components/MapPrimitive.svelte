<script lang="ts">
import LegacyMap from '$lib/bits/patterns/maps/Maplet.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'
import type { AddressMeta } from '$lib/utils/address.types'

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

// Keep admin preferences and navigation state at the application adapter boundary.
const adminCtx = getAdminCtx()
const initialCollapsed =
  adminCtx.appCtx.getUserPreferences().admin?.isAdminMapCollapsed ?? false
</script>

<div class="bits-feature-map">
  <LegacyMap
    {coordinates}
    {initialCenter}
    {addressMeta}
    {draggable}
    {initialCollapsed}
    activeResourceRef={adminCtx.activeResourceRef}
    dragEndCallback={onCoordinateChange}
    toggleFullscreen={onToggleFullscreen}
    toggleCollapsed={onToggleCollapsed}
  />
</div>
