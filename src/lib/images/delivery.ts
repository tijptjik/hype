// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PUBLIC PATH HELPERS
//    - toCloudflareImageWorkerPath
//    - toImagePrerenderWorkerPaths

const DEFAULT_CROP_MODE = 'c_fit'
export const IMAGE_PRERENDER_TRANSFORMATIONS = [
  'c_fill,h_256,w_256',
  'c_fill,h_128,w_128',
  'c_fit,h_1024,w_1024',
] as const

/**
 * Builds the Cloudflare image worker path for either transformed or raw image requests.
 *
 * @param params Image worker path inputs.
 * @returns Public worker path.
 */
export const toCloudflareImageWorkerPath = (params: {
  env: string
  publicId: string
  version?: number | null
  raw?: boolean
  transformation?: string
  gravity?: string
  quality?: string
  format?: string
}): string => {
  const versionSegment = typeof params.version === 'number' ? `/v${params.version}` : ''

  if (params.raw) {
    return `/${params.env}/image/upload${versionSegment}/${params.publicId}`
  }

  return `/${params.env}/image/upload/${params.transformation ?? DEFAULT_CROP_MODE}/g_${params.gravity ?? 'auto'}/f_${params.format ?? 'auto'}/q_${params.quality ?? 'auto'}${versionSegment}/${params.publicId}`
}

/**
 * Builds the fixed worker paths that should be pre-rendered for an image.
 *
 * @param params Image worker path inputs.
 * @returns Worker paths for the canonical pre-render set.
 */
export const toImagePrerenderWorkerPaths = (params: {
  env: string
  publicId: string
  version?: number | null
  gravity?: string
  quality?: string
  format?: string
}): string[] =>
  IMAGE_PRERENDER_TRANSFORMATIONS.map(transformation =>
    toCloudflareImageWorkerPath({
      env: params.env,
      publicId: params.publicId,
      version: params.version,
      transformation,
      gravity: params.gravity,
      quality: params.quality,
      format: params.format,
    }),
  )
