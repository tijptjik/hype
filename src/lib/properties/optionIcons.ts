// Each symbol uses the same 24-unit stroke grid as the Recorder controls.
type Symbol = { path: string; color?: string; tint?: string }

const compass = 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 3v2m0 14v2M3 12h2m14 0h2'
const flag = 'M5 21V4'
const wrench = 'M14 4a5 5 0 0 0-6 6l-5 5a2 2 0 0 0 3 3l5-5a5 5 0 0 0 6-6l-3 3-3-3z'
const corners = 'M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5'
const plate = 'M3 5h18v14H3z'
const strata = 'm3 12 9-5 9 5-9 5z'
const patch = 'M4 4h16v16H4z'
const textures = {
  concrete: {
    path: 'M7 10l1-1m5 5 1 1m2-6h1m-9 6h1',
    color: '#414854',
    tint: '#dce1e6',
  },
  wood: {
    path: 'M6 9q4-3 8 0t4 0M6 15q3-2 5 0t7-1m-6-3q2-2 4 0-2 2-4 0Z',
    color: '#74411e',
    tint: '#f0d5b0',
  },
  metal: { path: 'M6 13l6-6m0 8 5-5m-9 7 2-2', color: '#38576d', tint: '#d1e3ed' },
  stone: {
    path: 'M4 12l6-4 5 3 5-3M10 8l2-4m3 7-2 5 2 4',
    color: '#51496c',
    tint: '#e1dbea',
  },
  brick: {
    path: 'M4 9h16M4 15h16M11 4v5m-4 0v6m9-6v6m-5 0v5',
    color: '#803e2c',
    tint: '#f3d5c7',
  },
  tile: { path: 'M4 12h16M12 4v16', color: '#1f615f', tint: '#c9e7e2' },
  terrazzo: {
    path: 'M6 8l3-1-1 3zm8 0 3 2-3 1zm-4 6 2 3H8zm6 1 1 2',
    color: '#784d60',
    tint: '#efd8e1',
  },
  acrylic: {
    path: 'M6 14l5-8 7 8-6 4zM11 6l1 12m-6-4h12',
    color: '#356885',
    tint: '#d1ecf4',
  },
  paint: {
    path: 'M7 14c0-2 4-7 5-8 1 1 5 6 5 8a5 5 0 0 1-10 0Z',
    color: '#943e53',
    tint: '#ffdae1',
  },
  mixed: { path: 'M6 7h5v5H6zm7 9 3-5 3 5zM8 15v2', color: '#685425', tint: '#f0e2b5' },
  other: { path: 'M7 12h.2m4.8 0h.2m4.8 0h.2', color: '#485460', tint: '#e2e7eb' },
} satisfies Record<string, Symbol>

// Within each family the common outline identifies the property and the interior identifies its value.
export const propertyOptionIcons: Record<string, Symbol> = {
  'site-east': { path: compass + 'M18 12l-10-4 2 4-2 4z' },
  'site-main': { path: compass + 'M9 15v-5l3-3 3 3v5z' },
  'site-north': { path: compass + 'M12 6l4 11-4-2-4 2z' },
  'priority-low': { path: flag + 'M5 13h12l-3 3 3 2H5' },
  'priority-medium': { path: flag + 'M5 9h13l-3 3 3 3H5' },
  'priority-high': { path: flag + 'M5 4h14l-3 4 3 3H5' },
  'recovery-low': { path: wrench + 'M14 21v-3' },
  'recovery-medium': { path: wrench + 'M14 21v-3m3 3v-6' },
  'recovery-high': { path: wrench + 'M14 21v-3m3 3v-6m3 6v-9' },
  'size-small': { path: corners + 'M10 10h4v4h-4z' },
  'size-medium': { path: corners + 'M8 8h8v8H8z' },
  'size-large': { path: corners + 'M6 6h12v12H6z' },
  'condition-deteriorated': { path: 'M3 5h8l-2 5 3 2-6 7H3zm12 0h6v14h-9l5-7-3-2z' },
  'condition-weathered': { path: plate + 'M13 5l-3 5 3 2-3 4M6 8h1m9 7h2' },
  'condition-preserved': { path: plate + 'M7 12l3 3 7-7' },
  'completeness-trace': { path: 'M3 10V6h4m10 0h4v3m0 6v3h-4m-10 0H3v-3m3-2h2' },
  'completeness-partial': { path: 'M3 6h9l-2 4 3 3-3 5H3zm14 0h4v3m0 6v3h-4' },
  'completeness-complete': { path: 'M3 6h18v12H3zM6 10h12m-12 4h8' },
  'strata-exposed': { path: strata },
  'strata-overpainted': { path: 'm3 15 9 5 9-5M4 4h11v5H4zm11 2h4v6h-7v3' },
  'strata-overlaid': { path: strata + 'M3 16l9 5 9-5' },
  'strata-revealed': { path: 'm3 14 9 5 9-5-8-5-3 4zM10 13l3-8 6 4z' },
  'technique-painted': {
    path: 'M10 13l9-10 2 2-8 11zM10 14c-5-1-3 5-7 6 7 2 10-2 9-5',
    color: '#873e58',
    tint: '#f9dbe5',
  },
  'technique-stencilled': {
    path: 'M3 4h18v16H3zM8 16l3-8m2 0 3 8m-6-3h4',
    color: '#446637',
    tint: '#dceccf',
  },
  'technique-printed': {
    path: 'M7 8V3h10v5M6 17H3V9h18v8h-3M7 14h10v7H7zm9-3h1',
    color: '#354f86',
    tint: '#d9e3fa',
  },
  'technique-engraved': {
    path: 'M7 14l9-11 4 3-9 11-5 2zm0 8h14',
    color: '#5f5082',
    tint: '#e6def3',
  },
  'technique-carved': {
    path: 'M5 14l9-12 5 4-9 11-6 2zm5 3 5 4h6',
    color: '#74411e',
    tint: '#f0d5b0',
  },
  'technique-cast': {
    path: 'M3 12v8h18v-8h-4l-2 5H9l-2-5zM8 4l6 3-2 4-6-3zm6 4 2 2v3',
    color: '#6d5429',
    tint: '#f3e4be',
  },
  'technique-mounted': {
    path: 'M3 6h18v12H3zM6 9l2 2m-2 0 2-2m8 4 2 2m-2 0 2-2',
    color: '#365b67',
    tint: '#d4e9ec',
  },
}
for (const [material, symbol] of Object.entries(textures)) {
  propertyOptionIcons['material-' + material] = { ...symbol, path: patch + symbol.path }
  propertyOptionIcons['substrate-' + material] = {
    ...symbol,
    path: patch + symbol.path + 'M3 23h18',
  }
}

/** Resolve an option's stored glyph identifier to trusted vector artwork.
 * @param id Optional catalogue identifier.
 * @returns The symbol if this client knows it.
 */
export function propertyOptionIcon(id?: string | null): Symbol | undefined {
  return id && Object.hasOwn(propertyOptionIcons, id)
    ? propertyOptionIcons[id]
    : undefined
}
