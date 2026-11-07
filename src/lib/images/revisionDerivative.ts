// DOMAIN
import { parseRevisionTransformOptions } from './revisionTransformOptions.js'
// TYPES
import type { PinnedImageDelivery } from '#lib/db/services/imageRevisionDelivery.js'

/**
 * Locates an existing asset-worker derivative for an exact revision.
 * @param pin Immutable source locator and retained metadata from the database.
 * @param url Requested display dimensions and format.
 * @returns Existing derivative key, or null when this revision needs its own rendering.
 * @remarks Never follows a latest manifest. Review rotations have separate pixel semantics
 * and cannot reuse an unrotated upload thumbnail. Raw downloads bypass this path.
 */
export function revisionDerivativeKey(
  pin: PinnedImageDelivery,
  url: URL,
): string | null {
  if (!url.searchParams.has('t')) return null
  const options = parseRevisionTransformOptions(url)
  const metadata = pin.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const version = metadata.version
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0)
    return null
  if (metadata.renderRotation != null && metadata.renderRotation !== 0) return null
  // c_limit has different enlargement semantics from the worker's c_fit derivatives.
  if (options.withoutEnlargement) return null
  const transform = [
    options.cropMode,
    options.width ? `w_${options.width}` : null,
    options.height ? `h_${options.height}` : null,
    options.gravity,
    `q_${options.quality}`,
    `f_${options.format}`,
  ]
    .filter(Boolean)
    .join(',')
  const publicId = pin.storageKey.replace(/\.(avif|jpe?g|jxl|png|svg|webp)$/i, '')
  return `${publicId}/v${version}/${transform}`
}
