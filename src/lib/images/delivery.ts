// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PUBLIC PATH HELPERS
//    - toCloudflareImageWorkerPath

const DEFAULT_CROP_MODE = 'c_fit'

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
  if (params.raw) {
    return `/${params.env}/image/upload/v${params.version}/${params.publicId}`
  }

  return `/${params.env}/image/upload/${params.transformation ?? DEFAULT_CROP_MODE}/g_${params.gravity ?? 'auto'}/f_${params.format ?? 'auto'}/q_${params.quality ?? 'auto'}/v${params.version}/${params.publicId}`
}
