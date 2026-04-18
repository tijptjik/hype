import { dev } from '$app/environment'

import { loadScript } from '$lib'

const MAPLIBRE_VERSION = 'latest'
const MAPLIBRE_CDN_BASE = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist`
const MAPLIBRE_SCRIPT_ID = 'maplibre-gl-script'
const MAPLIBRE_STYLE_ID = 'maplibre-gl-style'

type MapLibreModule = typeof import('maplibre-gl')

/**
 * Ensures the MapLibre stylesheet is loaded exactly once.
 *
 * @returns Promise that resolves when the stylesheet is available.
 */
export const ensureMapLibreStyles = async (): Promise<void> => {
  if (dev) {
    await import('maplibre-gl/dist/maplibre-gl.css')
    return
  }

  if (document.getElementById(MAPLIBRE_STYLE_ID)) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.id = MAPLIBRE_STYLE_ID
    link.rel = 'stylesheet'
    link.href = `${MAPLIBRE_CDN_BASE}/maplibre-gl.css`
    link.addEventListener('load', () => resolve())
    link.addEventListener('error', () =>
      reject(new Error('Failed to load MapLibre CSS')),
    )
    document.head.appendChild(link)
  })
}

/**
 * Loads the MapLibre runtime from local assets in dev and the CDN in non-dev builds.
 *
 * @returns Loaded MapLibre module namespace.
 */
export const loadMapLibre = async (): Promise<MapLibreModule['default']> => {
  if (dev) {
    const module = await import('maplibre-gl')
    return module.default
  }

  if (!document.getElementById(MAPLIBRE_SCRIPT_ID)) {
    const script = (await loadScript(
      `${MAPLIBRE_CDN_BASE}/maplibre-gl.js`,
    )) as HTMLScriptElement
    script.id = MAPLIBRE_SCRIPT_ID
  }

  const globalMapLibre = globalThis.maplibregl as MapLibreModule['default'] | undefined
  if (!globalMapLibre) {
    throw new Error('MapLibre global was not available after loading the CDN script')
  }

  return globalMapLibre
}
