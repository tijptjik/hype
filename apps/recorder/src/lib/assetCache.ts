// API
import { recorderOrigin } from './hype'

const prefix = 'hype-recorder-assets-v1/' + recorderOrigin + '/'
let activeCache: Cache | undefined

/** Select the verified contributor's persistent asset cache and discard previous owners' files.
 * @param accountId Current HYPE identity, or null after sign-out.
 * @returns Once the cache is ready or storage is unavailable.
 */
export async function setAssetAccount(accountId: string | null): Promise<void> {
  activeCache = undefined
  const name = accountId ? prefix + encodeURIComponent(accountId) : null
  try {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== name) await caches.delete(key)
    }
    if (name) activeCache = await caches.open(name)
  } catch {
    // A WebView with storage disabled can still load assets over the native transport.
  }
}

/** Read a versioned file, admitting a complete download to disk only after decoding succeeds.
 * @param url Exact release or model file URL.
 * @param signal View lifetime.
 * @param decode Reader for the original bytes, including any domain integrity checks.
 * @param reload Fetch fresh bytes after the viewer reports a rendering failure.
 * @returns Decoded file or null for an unsuccessful HTTP response.
 * @remarks The model viewer must fetch authorized placement metadata before requesting model files.
 */
export async function readRecorderAsset<T>(
  url: URL | string,
  signal: AbortSignal,
  decode: (blob: Blob) => Promise<T> | T,
  reload = false,
): Promise<T | null> {
  const cache = activeCache
  const key = new URL(url, location.href).href
  const cached = reload ? undefined : await cache?.match(key).catch(() => undefined)
  signal.throwIfAborted()
  if (cached) {
    try {
      return await decode(await cached.blob())
    } catch {
      // Retry a damaged entry from the server on this visit.
      await cache?.delete(key).catch(() => false)
    }
  }

  const response = await fetch(key, { signal })
  if (response.status !== 200) return null
  const blob = await response.blob()
  const result = await decode(blob)
  signal.throwIfAborted()
  if (
    cache &&
    cache === activeCache &&
    !/\bno-store\b/i.test(response.headers.get('cache-control') ?? '')
  ) {
    // Store the original bytes, before the viewer replaces glTF references with temporary blob URLs.
    await cache.put(key, new Response(blob)).catch(() => {
      // Storage pressure must not prevent rendering a successful download.
    })
  }
  return result
}
