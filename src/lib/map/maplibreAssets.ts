import { dev } from '$app/environment'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

const MAPLIBRE_CDN_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl'
const MAPLIBRE_LATEST_PACKAGE_URL = 'https://registry.npmjs.org/maplibre-gl/latest'
const MAPLIBRE_STYLE_ID = 'maplibre-gl-style'

type MapLibreModule = typeof import('maplibre-gl')

let mapLibreCdnBasePromise: Promise<string> | null = null

/**
 * Resolves the current npm MapLibre release to an immutable jsDelivr asset base.
 *
 * @returns CDN base URL for one exact MapLibre release.
 * @remarks The moving jsDelivr `latest` alias may cache the entry and sibling
 * modules at different generations. Resolving npm's latest manifest first keeps
 * all runtime assets on the same current release without pinning future upgrades.
 */
export const resolveMapLibreCdnBase = async (): Promise<string> => {
  const response = await fetch(MAPLIBRE_LATEST_PACKAGE_URL, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error('Failed to resolve the latest MapLibre release')
  }

  const { version } = (await response.json()) as { version?: unknown }
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    throw new Error('Latest MapLibre release did not provide a valid version')
  }

  return `${MAPLIBRE_CDN_URL}@${version}/dist`
}

/**
 * Gets the latest MapLibre release's immutable CDN asset base once per page.
 *
 * @returns CDN base URL shared by the MapLibre module and stylesheet.
 */
const getMapLibreCdnBase = (): Promise<string> => {
  mapLibreCdnBasePromise ??= resolveMapLibreCdnBase()
  return mapLibreCdnBasePromise
}

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

  const mapLibreCdnBase = await getMapLibreCdnBase()

  await new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.id = MAPLIBRE_STYLE_ID
    link.rel = 'stylesheet'
    link.href = `${mapLibreCdnBase}/maplibre-gl.css`
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

  const mapLibreCdnBase = await getMapLibreCdnBase()
  return import(
    /* @vite-ignore */ `${mapLibreCdnBase}/maplibre-gl.mjs`
  ) as Promise<MapLibreModule>
}
