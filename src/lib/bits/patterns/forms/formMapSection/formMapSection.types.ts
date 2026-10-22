export type FormMapSectionProps = {
  showMarker?: boolean
  onMapReady?: (
    controller: import('#lib/map/controller.js').MapController | null,
  ) => void
  locationCandidates?: import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
  onLocationCandidateSelect?: (id: string) => void
  coordinates: number[]
  initialZoom?: number
  initialCenter?: [number, number] | null
  addressMeta: import('#lib/utils/address.types.js').AddressMeta | null
  draggable?: boolean
  onCoordinateChange?: (coordinates: number[]) => void
  onToggleFullscreen?: (isFullscreen: boolean) => void
  onToggleCollapsed?: (isCollapsed: boolean) => void
  class?: string
}
