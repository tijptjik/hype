/** Persisted presentation choices; custom renderers are registered outside MapLibre. */
export const MARKER_STYLE_CODES = ['image', 'dot', 'pin', 'flag', 'breadline'] as const
export type MarkerStyleCode = (typeof MARKER_STYLE_CODES)[number]
export const DEFAULT_MARKER_STYLE: MarkerStyleCode = 'image'
export const MARKER_STYLE_CATALOG = [
  { code: 'image', name: 'Photo', description: 'Circular feature photograph.' },
  { code: 'dot', name: 'Dot', description: 'Small, simple map point.' },
  {
    code: 'flag',
    name: 'Country chip',
    description: 'Photo framed by flags from the country property.',
  },
  {
    code: 'breadline',
    name: 'Brand status',
    description: 'Brand identity with availability and claim states; no shop photos.',
  },
] as const

/**
 * Validates persisted or submitted renderer codes.
 * @param value Untrusted code.
 * @returns Whether the code has a registered renderer.
 */
export function isMarkerStyleCode(value: unknown): value is MarkerStyleCode {
  return MARKER_STYLE_CODES.some(code => code === value)
}

/**
 * Resolves layer overrides before project defaults and the application default.
 * @param projectCode Project presentation choice.
 * @param layerCode Optional layer override; null means inherit.
 * @param fallback Application default when neither hierarchy level has a choice.
 * @returns Registered style code.
 */
export function resolveMarkerStyle(
  projectCode?: unknown,
  layerCode?: unknown,
  fallback: MarkerStyleCode = DEFAULT_MARKER_STYLE,
): MarkerStyleCode {
  // Retired pins resolve to photos so existing saved values cannot reintroduce pins.
  const resolved = isMarkerStyleCode(layerCode)
    ? layerCode
    : isMarkerStyleCode(projectCode)
      ? projectCode
      : fallback
  return resolved === 'pin' ? DEFAULT_MARKER_STYLE : resolved
}
