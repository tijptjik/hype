<script lang="ts">
import LegacyMap from '#lib/bits/patterns/maps/Maplet.svelte'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { THEME_MAP_STYLES } from '#lib/themes/themes.js'
// TYPES
import type { AddressMeta } from '#lib/utils/address.types.js'

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
const theme = getThemeModel()
// Admin previews follow the user's choice independently of public active layers.
const mapStyleCode = $derived(theme.mapSelected ?? THEME_MAP_STYLES[theme.selected])
const initialCollapsed =
  adminCtx.view.getUserPreferences().admin?.isAdminMapCollapsed ?? false
</script>

<div class="bits-feature-map">
  <LegacyMap
    {coordinates}
    {initialCenter}
    {addressMeta}
    {mapStyleCode}
    {draggable}
    {initialCollapsed}
    activeResourceRef={adminCtx.activeResourceRef}
    dragEndCallback={onCoordinateChange}
    toggleFullscreen={onToggleFullscreen}
    toggleCollapsed={onToggleCollapsed}
  />
</div>
