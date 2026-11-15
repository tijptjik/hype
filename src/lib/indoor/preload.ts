// DOMAIN
import { loadIndoorData, value } from './model'
// TYPES
import type { IndoorData } from './model'

const lifetime = 30_000
const capacity = 3
const prepared = new Map<string, { data: Promise<IndoorData>; expires: number }>()
let visible: string[] = []
let running = 0
const background = new Set<string>()

/** Warm browser image caches without making optional artwork block entry.
 * @param data Validated indoor release. @returns Nothing.
 */
function warmImages(data: IndoorData): void {
  if (typeof Image === 'undefined') return
  const urls = new Set([
    ...data.level_polygon.features.map(level => value(level.properties, 'image_url')),
    ...Object.values(data.unitArtwork ?? {}).map(artwork => artwork.src),
  ])
  for (const url of urls) {
    if (!url) continue
    const image = new Image()
    image.src = url
    void image.decode().catch(() => {})
  }
}

/** Share visible-map preparation with a click during an in-flight download.
 * @param base Published map endpoint. @returns Validated geometry and current presentation.
 * @remarks Entries expire after 30 seconds. Explicit publication refresh bypasses this cache.
 */
export function prepareIndoorData(base: string): Promise<IndoorData> {
  const cached = prepared.get(base)
  if (cached && cached.expires > Date.now()) return cached.data
  prepared.delete(base)
  const entry: { expires: number; data: Promise<IndoorData> } = {
    expires: Number.POSITIVE_INFINITY,
    data: loadIndoorData(base)
      .then(data => {
        entry.expires = Date.now() + lifetime
        warmImages(data)
        return data
      })
      .catch(error => {
        if (prepared.get(base) === entry) prepared.delete(base)
        throw error
      }),
  }
  prepared.set(base, entry)
  // Bound retained geometry even when the user pans across many premises.
  while (prepared.size > capacity) {
    const oldest = prepared.keys().next().value
    if (oldest) prepared.delete(oldest)
  }
  return entry.data
}

/** Start at most two background loads and discard queued offscreen destinations.
 * @returns Nothing.
 */
function pump(): void {
  for (const base of visible) {
    if (running >= 2) break
    if (background.has(base) || (prepared.get(base)?.expires ?? 0) > Date.now())
      continue
    running++
    background.add(base)
    void prepareIndoorData(base)
      .catch(() => {
        // A failed speculative request is retried on a user click, not in a busy loop.
      })
      .finally(() => {
        running--
        background.delete(base)
        visible = visible.filter(item => item !== base)
        pump()
      })
  }
}

/** Preload a bounded set of premises whose footprints are currently visible.
 * @param bases Visible published-map endpoints. @returns Nothing.
 */
export function preloadVisibleIndoorMaps(bases: string[]): void {
  visible = [...new Set(bases)].slice(0, capacity)
  pump()
}
