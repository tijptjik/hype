import {
  toCloudflareImageWorkerPath,
  toImageRawIntermediateWorkerPath,
} from './delivery'
import type { AssetRenderJob } from '../types'

const NON_DERIVATIVE_EXTENSIONS = new Set(['gif', 'svg'])
const PRIORITY_PRERENDER_TRANSFORMATIONS = [
  'c_fill,h_128,w_128',
  'c_fill,h_256,w_256',
  'c_fit,h_1024,w_1024',
] as const
const PRIORITY_PRERENDER_FORMATS = ['webp', 'jpeg'] as const
const MAX_NORMALIZED_DIMENSION = 2048

export const IMAGE_WARMUP_ACCEPT_HEADER =
  'image/webp,image/jpeg,image/*;q=0.9,*/*;q=0.8'

export type ImageWarmupMetadata = {
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  metadata?: Record<string, string> | null
}

export type ImageWarmupTarget = {
  kind: 'rawIntermediate' | 'prerender'
  path: string
  required: boolean
}

export type ImageWarmupPlan = {
  shouldWarm: boolean
  skipReason: 'unsupported-source-format' | null
  normalizedIntermediateExpected: boolean
  derivativesSupported: boolean
  sourceExtension: string | null
  targets: ImageWarmupTarget[]
}

/**
 * Normalizes an original extension into the small set of values used by warmup planning.
 *
 * @param extension Metadata extension value.
 * @returns Lowercased extension without a leading dot.
 */
export const normalizeWarmupExtension = (
  extension: string | null | undefined,
): string | null => {
  if (!extension) return null

  const normalized = extension.trim().toLowerCase().replace(/^\./u, '')

  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'tif') return 'tiff'

  return normalized || null
}

const parseMetadataDimension = (
  metadata: Record<string, string> | null | undefined,
  key: 'uploadedWidth' | 'uploadedHeight',
): number | null => {
  const rawValue = metadata?.[key]
  if (!rawValue) return null

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const toLongestSide = (
  width: number | null | undefined,
  height: number | null | undefined,
): number | null =>
  typeof width === 'number' && typeof height === 'number'
    ? Math.max(width, height)
    : null

/**
 * Builds the format-aware warmup plan for one uploaded image.
 *
 * @param params Queue job plus persisted metadata sidecar.
 * @returns Ordered warmup targets or a skip reason.
 */
export const getImageWarmupPlan = (params: {
  job: AssetRenderJob
  metadata: ImageWarmupMetadata | null | undefined
}): ImageWarmupPlan => {
  const sourceExtension = normalizeWarmupExtension(params.metadata?.originalExtension)
  const derivativesSupported = !NON_DERIVATIVE_EXTENSIONS.has(sourceExtension ?? '')
  const originalLongestSide = toLongestSide(
    params.metadata?.originalWidth ?? null,
    params.metadata?.originalHeight ?? null,
  )
  const uploadedLongestSide = toLongestSide(
    parseMetadataDimension(params.metadata?.metadata, 'uploadedWidth'),
    parseMetadataDimension(params.metadata?.metadata, 'uploadedHeight'),
  )
  const clientResizeApplied = params.metadata?.metadata?.clientResizeApplied === 'true'
  const normalizedIntermediateExpected =
    derivativesSupported &&
    ((originalLongestSide ?? 0) > MAX_NORMALIZED_DIMENSION ||
      clientResizeApplied ||
      ((uploadedLongestSide ?? 0) > 0 &&
        (uploadedLongestSide ?? 0) <= MAX_NORMALIZED_DIMENSION &&
        (originalLongestSide ?? 0) > (uploadedLongestSide ?? 0)))

  if (!derivativesSupported) {
    return {
      shouldWarm: false,
      skipReason: 'unsupported-source-format',
      normalizedIntermediateExpected,
      derivativesSupported,
      sourceExtension,
      targets: [],
    }
  }

  const targets: ImageWarmupTarget[] = [
    ...(normalizedIntermediateExpected
      ? [
          {
            kind: 'rawIntermediate' as const,
            path: toImageRawIntermediateWorkerPath({
              publicId: params.job.publicId,
              version: params.job.version,
            }),
            required: true,
          },
        ]
      : []),
    ...PRIORITY_PRERENDER_FORMATS.flatMap(format =>
      PRIORITY_PRERENDER_TRANSFORMATIONS.map(transformation => ({
        kind: 'prerender' as const,
        path: toCloudflareImageWorkerPath({
          env: params.job.env,
          publicId: params.job.publicId,
          version: params.job.version,
          transformation,
          gravity: 'auto',
          quality: 'auto',
          format,
        }),
        required: false,
      })),
    ),
  ]

  return {
    shouldWarm: targets.length > 0,
    skipReason: null,
    normalizedIntermediateExpected,
    derivativesSupported,
    sourceExtension,
    targets,
  }
}
