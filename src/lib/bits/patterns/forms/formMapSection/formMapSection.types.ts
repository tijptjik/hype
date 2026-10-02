export type FormMapSectionProps = {
  coordinates: number[]
  initialCenter?: [number, number] | null
  addressMeta: import('#lib/utils/address.types.js').AddressMeta | null
  draggable?: boolean
  onCoordinateChange?: (coordinates: number[]) => void
  onToggleFullscreen?: (isFullscreen: boolean) => void
  onToggleCollapsed?: (isCollapsed: boolean) => void
  class?: string
}
