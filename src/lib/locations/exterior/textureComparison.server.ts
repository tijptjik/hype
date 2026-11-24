// STORAGE
import { premisesMapBucket } from '#lib/indoor/server/storage.js'

/** Resolve protected exterior comparisons for this stage.
 * @param platform Request platform.
 * @returns The stage originals bucket or the local development comparison binding.
 */
export function textureComparisonBucket(
  platform: App.Platform,
): ReturnType<typeof premisesMapBucket> {
  return platform.env.ENVIRONMENT === 'local' && platform.env.LOCAL_EXTERIOR_COMPARISONS
    ? platform.env.LOCAL_EXTERIOR_COMPARISONS
    : premisesMapBucket(platform)
}

/** Read the content-addressed comparison associated with an exact source revision.
 * @param platform Request platform.
 * @param assetId Current exterior asset.
 * @returns The immutable comparison filename, or null for ordinary exteriors.
 */
export async function textureComparisonFile(
  platform: App.Platform,
  assetId: string,
): Promise<string | null> {
  try {
    const pointer = await textureComparisonBucket(platform).get(
      `location-exteriors/${assetId}/texture-comparison.json`,
    )
    if (!pointer) return null
    const manifest = await pointer.json<{ file?: string }>()
    return typeof manifest?.file === 'string' &&
      /^comparison-[0-9a-f]{64}\.glb$/.test(manifest.file)
      ? manifest.file
      : null
  } catch (cause) {
    // Optional artwork must never block the Location's government model.
    console.warn('Could not read exterior texture comparison', assetId, cause)
    return null
  }
}
