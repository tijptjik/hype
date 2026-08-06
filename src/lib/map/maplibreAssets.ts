import { dev } from '$app/environment'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// `latest` can resolve the entry module and its sibling shared module to different
// CDN cache generations. MapLibre then fails during module initialisation before a
// map can be created, so keep this aligned with the installed package version.
export const MAPLIBRE_VERSION = '6.1.0'
const MAPLIBRE_CDN_BASE = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist`
const MAPLIBRE_MODULE_URL = `${MAPLIBRE_CDN_BASE}/maplibre-gl.mjs`
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
 * MapLibre 6 ships as an ES module and no longer exposes the legacy UMD global.
 *
 * @returns Loaded MapLibre module namespace.
 */
export const loadMapLibre = async (): Promise<MapLibreModule> => {
  if (dev) {
    const maplibre = await import('maplibre-gl')

    // Vite pre-bundles MapLibre, so its relative default worker URL cannot be
    // served reliably from the optimized dependency path during local development.
    maplibre.setWorkerUrl(mapLibreWorkerUrl)

    return maplibre
  }

  return import(/* @vite-ignore */ MAPLIBRE_MODULE_URL) as Promise<MapLibreModule>
}
