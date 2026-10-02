import { toLocaleKey } from '#lib/i18n.js'
import type { LocaleKey } from '#lib/types.js'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { applyRuntimeBasemapSource, getConfiguredBasemapAccessToken } from './source'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. STYLE REQUESTS
//    - hideSymbolLayers
//    - resolveRuntimeMapStyle
// 2. STYLE PRESENTATION
//    - getMapStyleSeaColor
//    - applyMapCanvasBackground

const DEFAULT_STYLE_ENDPOINT = '/api/mapStyles'
const DEFAULT_RETRY_COUNT = 2

const createAbortError = (): Error => {
  const error = new Error('The map style request was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Hides all symbol layers while retaining their sources and other layer metadata.
 *
 * @param style - Style to transform.
 * @returns A style copy with symbol layers hidden.
 */
export const hideSymbolLayers = (style: StyleSpecification): StyleSpecification => ({
  ...style,
  layers: style.layers?.map(layer =>
    layer.type === 'symbol'
      ? {
          ...layer,
          layout: { ...(layer.layout ?? {}), visibility: 'none' },
        }
      : layer,
  ),
})

/**
 * Resolves one application map style through the shared style endpoint.
 *
 * @param styleCode - Registered style key or endpoint path.
 * @param options - Locale, label visibility, cancellation, and retry controls.
 * @returns The resolved MapLibre style specification.
 * @remarks A cancelled request never retries and stale callers can safely discard
 * their result by reusing the same AbortSignal across a style effect.
 */
export const resolveRuntimeMapStyle = async (
  styleCode: string,
  options: {
    locale?: LocaleKey | string
    noLabels?: boolean
    signal?: AbortSignal
    retryCount?: number
  } = {},
): Promise<StyleSpecification> => {
  const endpoint = styleCode.startsWith('/')
    ? styleCode
    : `${DEFAULT_STYLE_ENDPOINT}/${encodeURIComponent(styleCode)}`
  const url = new URL(
    endpoint,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  )
  url.searchParams.set('inline', '1')
  if (options.locale)
    url.searchParams.set('locale', toLocaleKey(options.locale as LocaleKey))
  if (options.noLabels) url.searchParams.set('noLabels', '1')

  const retryCount = Math.max(0, options.retryCount ?? DEFAULT_RETRY_COUNT)
  let lastError: unknown

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    if (options.signal?.aborted) {
      throw createAbortError()
    }

    try {
      const response = await fetch(url, { signal: options.signal })
      if (!response.ok) {
        throw new Error(`Failed to load map style (${response.status})`)
      }
      const style = (await response.json()) as StyleSpecification
      const resolvedStyle = applyRuntimeBasemapSource(
        style,
        getConfiguredBasemapAccessToken(),
      )
      return options.noLabels ? hideSymbolLayers(resolvedStyle) : resolvedStyle
    } catch (error) {
      lastError = error
      if (options.signal?.aborted || attempt >= retryCount) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to load map style')
}

/**
 * Gets the solid colour used by a map style's water layer.
 *
 * @param style - Loaded MapLibre style specification.
 * @returns CSS colour for a canvas fallback.
 */
export const getMapStyleSeaColor = (style: StyleSpecification): string => {
  const waterLayer = style.layers?.find(layer => layer.id === 'water')
  const seaColor = (waterLayer?.paint as Record<string, unknown> | undefined)?.[
    'fill-color'
  ]
  return typeof seaColor === 'string' ? seaColor : '#101214'
}

/**
 * Applies a style's background colour to both the map host and WebGL canvas.
 *
 * @param host - Map host element.
 * @param style - Loaded MapLibre style specification.
 * @param map - Optional map instance whose canvas should be updated.
 * @returns Nothing.
 */
export const applyMapCanvasBackground = (
  host: HTMLElement,
  style: StyleSpecification,
  map?: MapLibreMap | null,
): void => {
  const seaColor = getMapStyleSeaColor(style)
  host.style.backgroundColor = seaColor
  map?.getCanvas().style.setProperty('background-color', seaColor)
}
