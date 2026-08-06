/**
 * Resolves resize dimensions for a Cloudflare Images transform.
 *
 * `c_fit` treats a single requested dimension as its own aspect-ratio-preserving
 * constraint. Fill and thumb modes retain the existing square-bound fallback
 * when only one dimension is supplied.
 *
 * @param cropMode Requested Cloudinary-compatible crop mode.
 * @param width Requested output width.
 * @param height Requested output height.
 * @returns Dimensions to pass to the Cloudflare Images binding.
 */
export const toCloudflareImagesTransformDimensions = (
  cropMode: string,
  width?: number,
  height?: number,
): { width?: number; height?: number } => {
  if (cropMode === 'c_fit') {
    return {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    }
  }

  const targetWidth = width ?? height
  const targetHeight = height ?? width

  return {
    ...(targetWidth !== undefined ? { width: targetWidth } : {}),
    ...(targetHeight !== undefined ? { height: targetHeight } : {}),
  }
}
