// API
import { readRecorderAsset } from './assetCache'
// DOMAIN
import {
  mapHash,
  validateMapBundle,
  type MapBundle,
} from '../../../../src/lib/indoor/releases'

/** Read the exact published plan referenced by a capture or floor selector.
 * @param map Map identity and immutable release hash.
 * @param signal Cancels work when the view closes.
 * @returns The verified plan, or null when the release is unavailable.
 */
export function readRecorderPlan(
  map: { id: string; hash: string },
  signal: AbortSignal,
): Promise<MapBundle | null> {
  return readRecorderAsset(
    '/api/premises-maps/' + encodeURIComponent(map.id) + '/releases/' + map.hash,
    signal,
    async blob => {
      const text = await blob.text()
      if ((await mapHash(text)) !== map.hash) throw new Error('Invalid plan release')
      return validateMapBundle(JSON.parse(text))
    },
  )
}
