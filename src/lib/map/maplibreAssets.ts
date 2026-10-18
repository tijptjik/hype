import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

type MapLibreModule = typeof import('maplibre-gl')

/**
 * Loads the dependency-locked MapLibre runtime and configures its Vite worker asset.
 *
 * @returns Loaded MapLibre module namespace.
 * @remarks Keeping the runtime and worker in the application bundle makes the
 * `svelte-maplibre-gl` components and imperative integrations share one Map class.
 */
export const loadMapLibre = async (): Promise<MapLibreModule> => {
  const maplibre = await import('maplibre-gl')
  maplibre.setWorkerUrl(mapLibreWorkerUrl)
  return maplibre
}
