<script lang="ts">
import { getContext } from 'svelte'
import {
  VISUAL_RESIZE_CONTEXT,
  type VisualResizeContext,
} from '#lib/bits/custom/main/visualResize.js'
import LegacyMap from '#lib/bits/patterns/maps/Maplet.svelte'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { THEME_MAP_STYLES } from '#lib/themes/themes.js'
// TYPES
import type { AddressMeta } from '#lib/utils/address.types.js'

type Props = {
  pinHighlightRequest?: number
  showMarker?: boolean
  onMapReady?: (
    controller: import('#lib/map/controller.js').MapController | null,
  ) => void
  locationCandidates?: import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
  onLocationCandidateSelect?: (id: string) => void
  coordinates: number[]
  initialZoom?: number
  initialCenter?: [number, number] | null
  addressMeta: AddressMeta | null
  draggable?: boolean
  onCoordinateChange?: (coordinates: number[]) => void
  onToggleFullscreen?: (isFullscreen: boolean) => void
  onToggleCollapsed?: (isCollapsed: boolean) => void
}

let {
  pinHighlightRequest = 0,
  showMarker = true,
  onMapReady,
  locationCandidates = [],
  onLocationCandidateSelect,
  coordinates,
  initialCenter = null,
  initialZoom = 20,
  addressMeta,
  draggable = false,
  onCoordinateChange,
  onToggleFullscreen,
  onToggleCollapsed,
}: Props = $props()

const resizeState = getContext<VisualResizeContext | undefined>(VISUAL_RESIZE_CONTEXT)

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
    {pinHighlightRequest}
    {showMarker}
    {onMapReady}
    {locationCandidates}
    {onLocationCandidateSelect}
    {coordinates}
    freezeForResize={resizeState?.active ?? false}
    {initialCenter}
    {initialZoom}
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
