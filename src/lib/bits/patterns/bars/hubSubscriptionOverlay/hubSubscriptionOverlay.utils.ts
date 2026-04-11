// SERVICES
import { getURLfromImage } from '$lib/client/services/image'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

export type DecorativeFeatureImage = {
  id: string
  src: string
  index: number
}

const DECORATIVE_IMAGE_HASH_MULTIPLIER = 31
const DECORATIVE_IMAGE_HASH_SEED_MULTIPLIER = 1_000_003

/**
 * Creates a stable per-render sort value so decorative images shuffle without jitter.
 *
 * @param imageId - The backing image identifier.
 * @param seed - The current shuffle seed for this overlay instance.
 * @returns A deterministic numeric sort key.
 */
export function getDecorativeImageSortValue(imageId: string, seed: number): number {
  let hash = Math.floor(seed * DECORATIVE_IMAGE_HASH_SEED_MULTIPLIER)

  for (let index = 0; index < imageId.length; index += 1) {
    hash = (hash * DECORATIVE_IMAGE_HASH_MULTIPLIER + imageId.charCodeAt(index)) >>> 0
  }

  return hash
}

/**
 * Maps the decorative image index onto an inverse ease-in-out curve so images
 * enter slower at the beginning and end, and faster through the middle.
 *
 * @param index - The decorative image index in render order.
 * @param count - Total number of decorative images.
 * @returns A stagger delay in milliseconds.
 */
export function getDecorativeImageDelay(index: number, count: number): number {
  if (count <= 1) {
    return 0
  }

  const normalizedIndex = Math.min(Math.max(index / (count - 1), 0), 1)
  const maxDelay = Math.min((count - 1) * 26, 2400)
  const easedDelayProgress = Math.acos(1 - normalizedIndex * 2) / Math.PI

  return Math.round(easedDelayProgress * maxDelay)
}

/**
 * Converts hub feature images into the decorative orbit image set.
 *
 * @param featureImages - Candidate feature images from the hub adapter.
 * @param seed - The current shuffle seed for this overlay instance.
 * @param limit - Maximum number of decorative images to render.
 * @returns Prepared decorative image records with transformed URLs.
 */
export function getDecorativeFeatureImages(
  featureImages: ImageCtxEnvelope[],
  seed: number,
  limit: number,
): DecorativeFeatureImage[] {
  return featureImages
    .map(image => ({
      image,
      sortValue: getDecorativeImageSortValue(image.image.id, seed),
    }))
    .sort((left, right) => left.sortValue - right.sortValue)
    .slice(0, limit)
    .map(({ image }, index) => {
      try {
        return {
          id: image.image.id,
          src: getURLfromImage({
            image,
            transformation: 'c_fill,h_256,w_256',
          }),
          index,
        }
      } catch {
        return null
      }
    })
    .filter((image): image is DecorativeFeatureImage => image !== null)
}
