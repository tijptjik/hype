/** Shared marker/filter/result palette, ordered by HYPE, SaanSeoi, and linked-feature status.
 * Each dimension has its own hue: saturated means present, a 50% tint means absent.
 */
// Bright status hues stay consistent across UI themes; absent states blend with the panel.
export const BRAND_LOCATION_STATES = [
  {
    key: 'hype',
    label: 'Record @ HYPE',
    ring: 'Outer',
    yes: '#ff168b',
    no: 'color-mix(in srgb, #ff168b 50%, var(--color-panel))',
  },
  {
    key: 'upstream',
    label: 'Record @ SaanSeoi',
    ring: 'Middle',
    yes: '#00b86b',
    no: 'color-mix(in srgb, #00b86b 50%, var(--color-panel))',
  },
  {
    key: 'linked',
    label: 'Has Linked Features',
    ring: 'Centre',
    yes: '#2563eb',
    no: 'color-mix(in srgb, #2563eb 50%, var(--color-panel))',
  },
] as const

export type BrandLocationMapPoint = {
  id: string
  name: string
  coordinates: [number, number]
  hype: boolean
  upstream: boolean
  linked: boolean
  shape?: 'circle' | 'square'
}

/** Validate publisher coordinates without inventing a position for unlocated results.
 * @param coordinates Optional longitude/latitude pair.
 * @returns Whether the pair can be placed on a map.
 */
export function hasMapCoordinates(
  coordinates: unknown,
): coordinates is [number, number] {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    coordinates.every(value => typeof value === 'number' && Number.isFinite(value)) &&
    Math.abs(coordinates[0]) <= 180 &&
    Math.abs(coordinates[1]) <= 90
  )
}

/** Fit all currently loaded points; missing coordinates never affect the camera.
 * @param points Validated map results.
 * @returns Southwest/northeast bounds, or null for no points.
 */
export function brandLocationBounds(
  points: BrandLocationMapPoint[],
): [[number, number], [number, number]] | null {
  if (!points.length) return null
  return [
    [
      Math.min(...points.map(point => point.coordinates[0])),
      Math.min(...points.map(point => point.coordinates[1])),
    ],
    [
      Math.max(...points.map(point => point.coordinates[0])),
      Math.max(...points.map(point => point.coordinates[1])),
    ],
  ]
}
