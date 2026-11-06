// IMAGE PRESENTATION
import { detectImageRims } from './rims.js'
// TYPES
import type { ImageRimBounds } from './rims.js'

const cache = new Map<string, Promise<ImageRimBounds | null>>()
let pending: Promise<unknown> = Promise.resolve()

/**
 * Reads one presentation source through the same-origin, restricted image reader.
 * @param src - Versioned source URL already used by the visible image.
 * @returns Detected visible bounds, or null when inspection is unavailable.
 * @remarks Analysis is serialized and bounded to four million pixels. Failures leave
 * ordinary image delivery intact; originals and saved metadata are never modified.
 */
async function inspect(src: string): Promise<ImageRimBounds | null> {
  let objectUrl: string | undefined
  try {
    const url = new URL(src, window.location.href)
    const readable =
      url.origin === window.location.origin || ['blob:', 'data:'].includes(url.protocol)
        ? url.href
        : `/api/images/presentation-source?src=${encodeURIComponent(url.href)}`
    const response = await fetch(readable, { signal: AbortSignal.timeout(8000) })
    if (
      !response.ok ||
      !/^image\/(png|jpeg|webp|avif)(?:;|$)/i.test(
        response.headers.get('content-type') ?? '',
      )
    )
      return null
    const blob = await response.blob()
    if (blob.size > 8 * 1024 * 1024) return null
    objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const width = image.naturalWidth,
      height = image.naturalHeight
    if (!width || !height || width * height > 4_194_304) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0)
    return detectImageRims(
      context.getImageData(0, 0, width, height).data,
      width,
      height,
    )
  } catch {
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Deduplicates pixel analysis across foregrounds, backdrops and repeated cards.
 * @param src - Exact source URL, including its version or revision identity.
 * @returns Shared analysis result; a bounded LRU retains only small bounds records.
 */
export function getImageRimBounds(src: string): Promise<ImageRimBounds | null> {
  const existing = cache.get(src)
  if (existing) {
    cache.delete(src)
    cache.set(src, existing)
    return existing
  }
  const result = pending.then(() => inspect(src))
  pending = result.catch(() => null)
  cache.set(src, result)
  if (cache.size > 96) cache.delete(cache.keys().next().value!)
  return result
}
