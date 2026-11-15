// NODE
import { createHash } from 'node:crypto'
// DOMAIN
import { layerNames } from '../../../src/lib/indoor/model'
import type { MapBundle } from '../../../src/lib/indoor/releases'

/** Serialize JSON deterministically without changing coordinate precision or array semantics.
 * @param value JSON value. @returns Stable JSON text.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Hash exact retained bytes. @param bytes Source bytes. @returns SHA-256 digest. */
export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Compare upstream content independently of transport IDs, ordering, retrieval time and local curations.
 * @param bundle Uncorrected source snapshot. @returns Versioned content digest.
 * @remarks Geometry precision and every source property except derived bbox are retained.
 */
export function contentHash(bundle: MapBundle): string {
  const layers = Object.fromEntries(
    layerNames.map(layer => [
      layer,
      bundle.data[layer].features
        .map(feature => ({
          geometry: feature.geometry,
          properties: Object.fromEntries(
            Object.entries(feature.properties).filter(([key]) => key !== 'bbox'),
          ),
        }))
        .map(feature => ({ feature, text: canonical(feature) }))
        .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
        .map(({ feature }) => feature),
    ]),
  )
  return sha256(canonical({ algorithm: 'landsd-content-v1', layers }))
}
