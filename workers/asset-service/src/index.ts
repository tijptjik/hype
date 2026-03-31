import { simd } from 'wasm-feature-detect'
import resize, { initResize } from '@jsquash/resize'
import squooshResizeWasm from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'
import decodeAvif, { init as initAvifDecode } from '@jsquash/avif/decode'
import encodeAvif, { init as initAvifEncode } from '@jsquash/avif/encode'
import avifDecodeWasm from '@jsquash/avif/codec/dec/avif_dec.wasm'
import avifEncodeWasm from '@jsquash/avif/codec/enc/avif_enc.wasm'
import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode'
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode'
import jpegDecodeWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'
import jpegEncodeWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'
import decodeJxl, { init as initJxlDecode } from '@jsquash/jxl/decode'
import encodeJxl, { init as initJxlEncode } from '@jsquash/jxl/encode'
import jxlDecodeWasm from '@jsquash/jxl/codec/dec/jxl_dec.wasm'
import jxlEncodeWasm from '@jsquash/jxl/codec/enc/jxl_enc.wasm'
import decodePng, { init as initPngDecode } from '@jsquash/png/decode'
import encodePng, { init as initPngEncode } from '@jsquash/png/encode'
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm'
import decodeWebp, { init as initWebpDecode } from '@jsquash/webp/decode'
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode'
import webpDecodeWasm from '@jsquash/webp/codec/dec/webp_dec.wasm'
import webpEncodeWasm from '@jsquash/webp/codec/enc/webp_enc.wasm'
import webpEncodeSimdWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm'
import smartcrop from 'smartcrop'
import {
  getImageWarmupPlan,
  IMAGE_WARMUP_ACCEPT_HEADER,
} from '../../../src/lib/images/warmup'
import type { ImageWarmupJob } from '../../../src/lib/types'

type ImageStage = 'local' | 'preview' | 'production'
type CropMode = 'c_fill' | 'c_fit' | 'c_thumb'
type GravityMode = 'g_auto' | 'g_center'
type OutputFormat = 'avif' | 'jpeg' | 'jxl' | 'png' | 'svg' | 'webp'
type MetadataProfile = 'admin' | 'auto' | 'basic' | 'full'
type ImageCacheStatus = 'edge-hit' | 'r2-derived-hit' | 'transform-miss'
type AssetAnalyticsStatus = ImageCacheStatus | 'not-found' | 'server-error'
type AnalyticsWindowKey = '1h' | '24h' | '7d' | '30d'

type Env = {
  ENVIRONMENT: ImageStage
  ASSET_DEBUG_MEMORY?: string
  ASSET_DEBUG_MEMORY_MATCH?: string
  BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS?: string
  ASSET_ANALYTICS: AnalyticsEngineDataset
  ASSET_WARMUP_ANALYTICS: AnalyticsEngineDataset
  ASSET_RAW_DEV: R2Bucket
  ASSET_RAW_PREVIEW: R2Bucket
  ASSET_RAW_PRODUCTION: R2Bucket
  ASSET_PUBLIC_DEV: R2Bucket
  ASSET_PUBLIC_PREVIEW: R2Bucket
  ASSET_PUBLIC_PRODUCTION: R2Bucket
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string
  ASSET_ANALYTICS_READ_TOKEN?: string
}

type ImageMetadataDocument = {
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
  latitude?: number | null
  longitude?: number | null
  metadata?: Record<string, string> | null
  [key: string]: unknown
}

type TransformRequest = {
  requestedStage: ImageStage
  publicId: string
  version?: number
  cropMode: CropMode
  gravity: GravityMode
  quality: string
  format: 'auto' | OutputFormat
  width?: number
  height?: number
  effects: string[]
}

type MetadataRequest = {
  requestedStage: ImageStage
  publicId: string
  version?: number
  profile: MetadataProfile
  format: 'json'
}

type RawRequest = {
  requestedStage: ImageStage
  publicId: string
  version?: number
  width?: number
  height?: number
}

type SourceAsset = {
  body: ArrayBuffer
  contentType: string
  objectKey: string
  stage: ImageStage
  version?: number
}

type DecodedImage = {
  data: ImageData
  hasAlpha: boolean
  inputFormat: OutputFormat | 'unknown'
}

type TransformDebugContext = {
  enabled: boolean
  publicId: string
  requestedStage: ImageStage
  requestPath: string
}

type TransformPipelineResult = {
  image: ImageData
  estimatedPeakPixelBytes: number
}

type AssetTransformStageErrorDetails = {
  error: string
  [key: string]: unknown
}

type SmartCropImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type SmartCropResult = {
  topCrop?: {
    x: number
    y: number
    width: number
    height: number
  }
}

type ImageResponseMetrics = {
  cacheStatus: ImageCacheStatus
  totalMs: number
  queueMs?: number
  versionMs?: number
  sourceMs?: number
  derivedLookupMs?: number
  transformMs?: number
}

type AssetAnalyticsEvent = {
  analyticsStatus: AssetAnalyticsStatus
  cacheStatus: ImageCacheStatus
  contentLength: number
  outputFormat: OutputFormat
  publicId: string
  requestedStage: ImageStage
  sourceStage: ImageStage
  totalMs: number
  transformKey: string
  version?: number
}

type AnalyticsTopRow = {
  key: string | null
  request_count: number | string
}

type AnalyticsRatiosRow = {
  total_requests: number | string
  edge_hit_requests: number | string
  derived_hit_requests: number | string
  transform_miss_requests: number | string
  not_found_requests: number | string
  server_error_requests: number | string
}

type AnalyticsQuantilesRow = {
  cache_status: AssetAnalyticsStatus | null
  p50_total_ms: number | string | null
  p95_total_ms: number | string | null
  p99_total_ms: number | string | null
  request_count: number | string
}

type AnalyticsTimeseriesRow = {
  date: string | null
  cache_status: AssetAnalyticsStatus | null
  request_count: number | string
}

type AnalyticsScope = {
  scopePrefixes: string[]
  organisationIds: string[]
  projectIds: string[]
}

type BreakdownBucketKey =
  | 'cropModes'
  | 'formats'
  | 'dimensions'
  | 'qualities'
  | 'gravities'

type AnalyticsBreakdownAccumulator = Record<BreakdownBucketKey, Map<string, number>>

type AnalyticsWindowSummary = {
  cacheHitPercent: number
  derivedHitPercent: number
  derivedMissPercent: number
  notFoundPercent: number
  serverErrorPercent: number
  p50Ms: {
    cache: number | null
    derivedHit: number | null
    derivedMiss: number | null
    notFound: number | null
    serverError: number | null
  }
  p95Ms: {
    cache: number | null
    derivedHit: number | null
    derivedMiss: number | null
    notFound: number | null
    serverError: number | null
  }
  p99Ms: {
    cache: number | null
    derivedHit: number | null
    derivedMiss: number | null
    notFound: number | null
    serverError: number | null
  }
  timeseries30d: Array<{
    date: string
    totalRequests: number
    cacheRequests: number
    derivedHitRequests: number
    derivedMissRequests: number
    notFoundRequests: number
    serverErrorRequests: number
  }>
  breakdowns: {
    cropModes: Array<{ key: string; label: string; requests: number; percent: number }>
    formats: Array<{ key: string; label: string; requests: number; percent: number }>
    dimensions: Array<{ key: string; label: string; requests: number; percent: number }>
    qualities: Array<{ key: string; label: string; requests: number; percent: number }>
    gravities: Array<{ key: string; label: string; requests: number; percent: number }>
  }
  topImages: Array<{ publicId: string; requests: number }>
  topMissingImages: Array<{ publicId: string; requests: number }>
  topServerErrorImages: Array<{ publicId: string; requests: number }>
  topTransformations: Array<{ requests: number; transformKey: string }>
  totalRequests: number
}

type AnalyticsSummaryResponse = {
  environment: ImageStage
  generatedAt: string
  scope: AnalyticsScope
  windows: Record<AnalyticsWindowKey, AnalyticsWindowSummary>
  windowErrors?: Partial<Record<AnalyticsWindowKey, string>>
}

type WarmupAttemptResult = {
  ok: boolean
  status: number | null
  error: string | null
  retryable: boolean
  retried: boolean
}

type AssetWarmupAnalyticsEventType =
  | 'skipped_by_format'
  | 'raw_intermediate_requested'
  | 'raw_intermediate_failed'
  | 'prerender_failed'
  | 'retried'
  | 'final_outcome'

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_CONTROL_SHORT = 'public, max-age=300'
const ASSET_ANALYTICS_DATASET = 'hype_asset_delivery'
const ASSET_ANALYTICS_WINDOWS: Record<AnalyticsWindowKey, string> = {
  '1h': "INTERVAL '1' HOUR",
  '24h': "INTERVAL '24' HOUR",
  '7d': "INTERVAL '7' DAY",
  '30d': "INTERVAL '30' DAY",
}
const ASSET_ANALYTICS_PUBLIC_ID_PREFIX = 'h/'
const MANIFEST_SUFFIX = '.manifest.json'
const METADATA_SUFFIX = '.json'
const MAX_CONCURRENT_TRANSFORMS = 2
const TRANSFORM_QUEUE_RETRY_AFTER_SECONDS = 2
const MAX_TRANSFORM_DIMENSION = 4096
const MAX_SMARTCROP_SOURCE_PIXELS = 4_000_000
// Bias toward the staged downscale path before a full-frame decode/resize/encode
// spikes worker memory on moderately large production images.
const MAX_LOW_MEMORY_SOURCE_PIXELS = 2_000_000
const LOW_MEMORY_MIN_INTERMEDIATE_DIMENSION = 1024
const LOW_MEMORY_MAX_INTERMEDIATE_DIMENSION = 2048
const LOW_MEMORY_FALLBACK_MAX_SOURCE_DIMENSION = 4096
const WARMUP_RETRY_DELAY_MS = 750
const WARMUP_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 522, 524])
const QUALITY_BY_FORMAT = {
  avif: 45,
  jpeg: 80,
  jxl: 75,
  webp: 75,
} as const

let activeTransformCount = 0

const bytesPerPixel = 4

const toImageDataBytes = (image: ImageData): number =>
  image.width * image.height * bytesPerPixel
const toPixelCount = (image: Pick<ImageData, 'width' | 'height'>): number =>
  image.width * image.height
const toMegapixels = (image: Pick<ImageData, 'width' | 'height'>): number =>
  Number((toPixelCount(image) / 1_000_000).toFixed(2))
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const getProcessMemoryUsage = (): Record<string, number> | null => {
  const processValue = (
    globalThis as typeof globalThis & {
      process?: { memoryUsage?: () => Record<string, number> }
    }
  ).process

  if (!processValue?.memoryUsage) {
    return null
  }

  try {
    return processValue.memoryUsage()
  } catch {
    return null
  }
}

const isTransformDebugEnabled = (
  env: Env,
  request: Request,
  transformRequest: TransformRequest,
): boolean => {
  if (request.headers.get('x-image-debug-memory') === '1') {
    return true
  }

  if (env.ASSET_DEBUG_MEMORY !== '1') {
    return false
  }

  const match = env.ASSET_DEBUG_MEMORY_MATCH?.trim()
  if (!match) {
    return true
  }

  return transformRequest.publicId.includes(match)
}

const logTransformDebug = (
  debug: TransformDebugContext,
  phase: string,
  details: Record<string, unknown>,
): void => {
  if (!debug.enabled) {
    return
  }

  console.warn(
    JSON.stringify(
      {
        event: 'asset-transform-memory-debug',
        phase,
        publicId: debug.publicId,
        requestedStage: debug.requestedStage,
        requestPath: debug.requestPath,
        processMemory: getProcessMemoryUsage(),
        ...details,
      },
      null,
      2,
    ),
  )
}

const isDebugTransformRequest = (debug: TransformDebugContext): boolean => debug.enabled

class AssetTransformStageError extends Error {
  phase: string
  details: AssetTransformStageErrorDetails

  constructor(phase: string, details: AssetTransformStageErrorDetails) {
    super(details.error)
    this.name = 'AssetTransformStageError'
    this.phase = phase
    this.details = details
  }
}

const chooseAutoOutputFormat = (accept: string): OutputFormat => {
  // Auto delivery is intentionally restricted to the two derived formats we
  // prerender operationally: WebP first, then JPEG as the universal fallback.
  if (accept.includes('image/webp')) return 'webp'
  return 'jpeg'
}

const shouldBlockProductionAutoTransformMiss = (
  env: Env,
  request: TransformRequest,
): boolean =>
  request.requestedStage === 'production' &&
  request.format === 'auto' &&
  env.BLOCK_PRODUCTION_AUTO_TRANSFORM_MISS === '1'

const ensureResizeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initResize(squooshResizeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureJpegDecodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initJpegDecode(jpegDecodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureJpegEncodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initJpegEncode(jpegEncodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensurePngDecodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initPngDecode(pngWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensurePngEncodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initPngEncode(pngWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureWebpDecodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initWebpDecode(webpDecodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureWebpEncodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = simd()
        .then(isSimd => initWebpEncode(isSimd ? webpEncodeSimdWasm : webpEncodeWasm))
        .then(() => undefined)
    }

    return ready
  }
})()

const ensureAvifDecodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initAvifDecode(avifDecodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureAvifEncodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initAvifEncode(avifEncodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureJxlDecodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initJxlDecode(jxlDecodeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureJxlEncodeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initJxlEncode(jxlEncodeWasm).then(() => undefined)
    }

    return ready
  }
})()

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FETCH ENTRY
// 2. ROUTE PARSING
// 3. ANALYTICS
// 4. SOURCE RESOLUTION
// 5. METADATA
// 6. TRANSFORM PIPELINE
// 7. FORMATS / CODECS
// 8. BUCKET / CACHE HELPERS

/**
 * Dispatches asset delivery and metadata requests for the standalone asset worker.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param ctx Execution context.
 * @returns Worker response.
 */
const handleFetch = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> => {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return Response.json({
      ok: true,
      environment: env.ENVIRONMENT,
    })
  }

  if (request.method === 'GET' && url.pathname === '/analytics/summary') {
    return handleAnalyticsSummaryRequest(request, env)
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    return new Response('Not found', { status: 404 })
  }

  const hasLegacyStagePrefix =
    segments[0] === 'local' || segments[0] === 'preview' || segments[0] === 'production'
  const stage = hasLegacyStagePrefix
    ? toStage(segments[0])
    : resolveRequestedStageFromRequest(url, env)
  const routeOffset = hasLegacyStagePrefix ? 1 : 0
  const mediaType = segments[routeOffset]
  const serviceType = segments[routeOffset + 1]

  if (mediaType !== 'image') {
    return new Response('Not found', { status: 404 })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (serviceType === 'metadata') {
    const parsed = parseMetadataRequest(stage, segments.slice(routeOffset + 2))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleMetadataRequest(request, env, parsed.value)
  }

  if (serviceType === 'raw') {
    const parsed = parseRawRequest(stage, segments.slice(routeOffset + 2))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleRawRequest(request, env, parsed.value)
  }

  if (serviceType === 'upload') {
    const parsed = parseTransformRequest(stage, segments.slice(routeOffset + 2))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleTransformRequest(request, env, ctx, parsed.value)
  }

  return new Response('Not found', { status: 404 })
}

/**
 * Validates that a queue payload matches the image warmup contract.
 *
 * @param value Queue message body.
 * @returns Whether the payload is a valid warmup job.
 */
const isImageWarmupJob = (value: unknown): value is ImageWarmupJob => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const job = value as Record<string, unknown>

  return (
    (job.env === 'local' || job.env === 'preview' || job.env === 'production') &&
    typeof job.publicId === 'string' &&
    (job.version === undefined || typeof job.version === 'number')
  )
}

const waitForWarmupRetry = async (ms: number): Promise<void> =>
  await new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/**
 * Executes one internal warmup request against the existing asset router.
 *
 * @param env Worker bindings.
 * @param ctx Worker execution context.
 * @param target Warmup target path and metadata.
 * @returns Attempt outcome used for summary logging and retry decisions.
 */
const warmImageTarget = async (
  env: Env,
  ctx: ExecutionContext,
  target: { path: string; required: boolean },
): Promise<WarmupAttemptResult> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await handleFetch(
        new Request(`https://asset-warmup.invalid${target.path}`, {
          method: 'HEAD',
          headers: {
            accept: IMAGE_WARMUP_ACCEPT_HEADER,
            'x-image-warmup': '1',
          },
        }),
        env,
        ctx,
      )

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          error: null,
          retryable: false,
          retried: attempt > 0,
        }
      }

      const retryable =
        WARMUP_RETRYABLE_STATUS_CODES.has(response.status) ||
        (target.required && response.status >= 500)

      if (retryable && attempt === 0) {
        await waitForWarmupRetry(WARMUP_RETRY_DELAY_MS)
        continue
      }

      return {
        ok: false,
        status: response.status,
        error: `Warmup request failed with status ${response.status} for ${target.path}`,
        retryable,
        retried: attempt > 0,
      }
    } catch (error) {
      if (attempt === 0) {
        await waitForWarmupRetry(WARMUP_RETRY_DELAY_MS)
        continue
      }

      return {
        ok: false,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
        retried: attempt > 0,
      }
    }
  }

  return {
    ok: false,
    status: null,
    error: `Warmup request exhausted retries for ${target.path}`,
    retryable: true,
    retried: true,
  }
}

/**
 * Processes one queued image warmup job using metadata-aware target planning.
 *
 * @param env Worker bindings.
 * @param ctx Worker execution context.
 * @param job Queue payload.
 * @returns Whether the message should be retried.
 */
const processImageWarmupJob = async (
  env: Env,
  ctx: ExecutionContext,
  job: ImageWarmupJob,
): Promise<{ retry: boolean }> => {
  const resolvedMetadata = await resolveMetadataDocument(env, job.env, {
    publicId: job.publicId,
    version: job.version,
  })
  const resolvedJob = {
    ...job,
    ...(typeof resolvedMetadata.version === 'number'
      ? { version: resolvedMetadata.version }
      : {}),
  } satisfies ImageWarmupJob
  const plan = getImageWarmupPlan({
    job: resolvedJob,
    metadata: resolvedMetadata.document,
  })

  if (!plan.shouldWarm) {
    recordAssetWarmupAnalytics(env, {
      type: 'skipped_by_format',
      publicId: job.publicId,
      requestedStage: job.env,
      resolvedStage: resolvedMetadata.stage,
      sourceExtension: plan.sourceExtension,
      variantKind: 'image',
      version: resolvedJob.version ?? null,
    })

    console.log(
      JSON.stringify({
        event: 'image-prerender-warmup-skipped',
        publicId: job.publicId,
        version: resolvedJob.version ?? null,
        env: job.env,
        sourceExtension: plan.sourceExtension,
        derivativesSupported: plan.derivativesSupported,
        normalizedIntermediateExpected: plan.normalizedIntermediateExpected,
        skipReason: plan.skipReason,
      }),
    )

    return { retry: false }
  }

  if (plan.targets.some(target => target.kind === 'rawIntermediate')) {
    recordAssetWarmupAnalytics(env, {
      type: 'raw_intermediate_requested',
      publicId: job.publicId,
      requestedStage: job.env,
      resolvedStage: resolvedMetadata.stage,
      sourceExtension: plan.sourceExtension,
      variantKind: 'rawIntermediate',
      version: resolvedJob.version ?? null,
      requestedCount: plan.targets.filter(target => target.kind === 'rawIntermediate')
        .length,
    })
  }

  const failures: Array<{
    kind: 'rawIntermediate' | 'prerender'
    path: string
    required: boolean
    status: number | null
    error: string
  }> = []
  let shouldRetry = false

  for (const target of plan.targets) {
    const result = await warmImageTarget(env, ctx, target)

    if (result.retried) {
      recordAssetWarmupAnalytics(env, {
        type: 'retried',
        publicId: job.publicId,
        requestedStage: job.env,
        resolvedStage: resolvedMetadata.stage,
        sourceExtension: plan.sourceExtension,
        variantKind: target.kind,
        version: resolvedJob.version ?? null,
        status: result.status,
      })
    }

    if (result.ok) {
      continue
    }

    failures.push({
      kind: target.kind,
      path: target.path,
      required: target.required,
      status: result.status,
      error: result.error ?? `Warmup request failed for ${target.path}`,
    })
    shouldRetry ||= result.retryable

    recordAssetWarmupAnalytics(env, {
      type:
        target.kind === 'rawIntermediate'
          ? 'raw_intermediate_failed'
          : 'prerender_failed',
      publicId: job.publicId,
      requestedStage: job.env,
      resolvedStage: resolvedMetadata.stage,
      sourceExtension: plan.sourceExtension,
      variantKind: target.kind,
      version: resolvedJob.version ?? null,
      status: result.status,
      failedCount: 1,
    })
  }

  for (const failure of failures) {
    console.warn(
      JSON.stringify({
        event: 'image-prerender-warmup-failed',
        publicId: job.publicId,
        version: resolvedJob.version ?? null,
        env: job.env,
        warmupKind: failure.kind,
        required: failure.required,
        status: failure.status,
        path: failure.path,
        error: failure.error,
      }),
    )
  }

  const summary = JSON.stringify({
    event: 'image-prerender-warmup-summary',
    publicId: job.publicId,
    version: resolvedJob.version ?? null,
    env: job.env,
    sourceExtension: plan.sourceExtension,
    derivativesSupported: plan.derivativesSupported,
    normalizedIntermediateExpected: plan.normalizedIntermediateExpected,
    totalRequested: plan.targets.length,
    failedCount: failures.length,
    rawIntermediateRequestedCount: plan.targets.filter(
      target => target.kind === 'rawIntermediate',
    ).length,
    rawIntermediateFailedCount: failures.filter(
      failure => failure.kind === 'rawIntermediate',
    ).length,
    prerenderRequestedCount: plan.targets.filter(target => target.kind === 'prerender')
      .length,
    prerenderFailedCount: failures.filter(failure => failure.kind === 'prerender')
      .length,
    metadataResolvedStage: resolvedMetadata.stage,
    shouldRetry,
  })

  if (failures.length > 0) {
    console.warn(summary)
  } else {
    console.log(summary)
  }

  recordAssetWarmupAnalytics(env, {
    type: 'final_outcome',
    publicId: job.publicId,
    requestedStage: job.env,
    resolvedStage: resolvedMetadata.stage,
    sourceExtension: plan.sourceExtension,
    variantKind: 'image',
    version: resolvedJob.version ?? null,
    queueRetry: shouldRetry,
    requestedCount: plan.targets.length,
    failedCount: failures.length,
  })

  return { retry: shouldRetry }
}

/**
 * Returns aggregate asset delivery analytics for fixed product windows.
 *
 * @param request Incoming HTTP request.
 * @param env Worker bindings and secrets.
 * @returns Summary response or an authorization/configuration error.
 */
const handleAnalyticsSummaryRequest = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  if (!isAuthorizedAnalyticsRequest(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_ANALYTICS_API_TOKEN) {
    return Response.json(
      {
        error:
          'Analytics query support is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_API_TOKEN on the asset worker.',
      },
      { status: 500 },
    )
  }

  try {
    const scope = toAnalyticsScope(new URL(request.url))
    const windowEntries = await Promise.all(
      (
        Object.entries(ASSET_ANALYTICS_WINDOWS) as Array<[AnalyticsWindowKey, string]>
      ).map(async ([windowKey, intervalExpression]) => {
        try {
          return [
            windowKey,
            await loadAnalyticsWindowSummary(
              env,
              env.ENVIRONMENT,
              intervalExpression,
              scope,
            ),
            null,
          ] as const
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : `Failed to load ${windowKey} analytics window`

          return [windowKey, null, message] as const
        }
      }),
    )

    const windows = Object.fromEntries(
      windowEntries.flatMap(([windowKey, summary]) =>
        summary ? [[windowKey, summary]] : [],
      ),
    ) as Record<AnalyticsWindowKey, AnalyticsWindowSummary>

    const windowErrors = Object.fromEntries(
      windowEntries.flatMap(([windowKey, _summary, message]) =>
        typeof message === 'string' && message.trim()
          ? [[windowKey, message.trim()]]
          : [],
      ),
    ) as Partial<Record<AnalyticsWindowKey, string>>

    const response: AnalyticsSummaryResponse = {
      environment: env.ENVIRONMENT,
      generatedAt: new Date().toISOString(),
      scope,
      windows,
      ...(Object.keys(windowErrors).length > 0 ? { windowErrors } : {}),
    }

    return Response.json(response, {
      headers: {
        'cache-control': 'private, max-age=60',
        'content-type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Analytics summary request failed',
      },
      { status: 500 },
    )
  }
}

/**
 * Checks the shared read token used to expose analytics safely.
 *
 * @param request Incoming HTTP request.
 * @param env Worker bindings and secrets.
 * @returns Whether the request is authorized.
 */
const isAuthorizedAnalyticsRequest = (request: Request, env: Env): boolean => {
  const expectedToken = env.ASSET_ANALYTICS_READ_TOKEN
  if (!expectedToken) {
    return false
  }

  const authorizationHeader = request.headers.get('authorization') ?? ''
  if (authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.slice('Bearer '.length) === expectedToken
  }

  return (
    request.headers.get('x-asset-analytics-token') === expectedToken ||
    request.headers.get('x-image-analytics-token') === expectedToken
  )
}

const toAssetAnalyticsPublicId = (publicId: string): string =>
  publicId.startsWith(ASSET_ANALYTICS_PUBLIC_ID_PREFIX)
    ? publicId
    : `${ASSET_ANALYTICS_PUBLIC_ID_PREFIX}${publicId}`

const toAssetAnalyticsNamespaceClause = (): string =>
  `index1 LIKE ${toSqlString(`${ASSET_ANALYTICS_PUBLIC_ID_PREFIX}%`)}`

const toAssetAnalyticsScopeClause = (scope: AnalyticsScope): string => {
  const scopePrefixes = [
    ...scope.scopePrefixes.map(prefix => `${prefix}%`),
    ...scope.organisationIds.map(
      organisationId =>
        `${ASSET_ANALYTICS_PUBLIC_ID_PREFIX}organisations/${organisationId}/%`,
    ),
    ...scope.projectIds.map(
      projectId => `${ASSET_ANALYTICS_PUBLIC_ID_PREFIX}projects/${projectId}/%`,
    ),
  ]

  if (scopePrefixes.length === 0) {
    return toAssetAnalyticsNamespaceClause()
  }

  return `(${scopePrefixes
    .map(prefix => `index1 LIKE ${toSqlString(prefix)}`)
    .join(' OR ')})`
}

const toAnalyticsScope = (url: URL): AnalyticsScope => ({
  scopePrefixes: Array.from(
    new Set(
      url.searchParams
        .getAll('scopePrefix')
        .map(prefix => prefix.trim())
        .filter(Boolean),
    ),
  ),
  organisationIds: Array.from(
    new Set(
      url.searchParams
        .getAll('organisationId')
        .map(id => id.trim())
        .filter(Boolean),
    ),
  ),
  projectIds: Array.from(
    new Set(
      url.searchParams
        .getAll('projectId')
        .map(id => id.trim())
        .filter(Boolean),
    ),
  ),
})

/**
 * Loads one analytics summary window from Workers Analytics Engine.
 *
 * @param env Worker bindings and secrets.
 * @param environment Environment to summarize.
 * @param intervalExpression SQL interval expression.
 * @returns Aggregated summary payload.
 */
const loadAnalyticsWindowSummary = async (
  env: Env,
  environment: ImageStage,
  intervalExpression: string,
  scope: AnalyticsScope,
): Promise<AnalyticsWindowSummary> => {
  const scopeClause = toAssetAnalyticsScopeClause(scope)
  const [
    topTransformRows,
    topImageRows,
    topMissingImageRows,
    topServerErrorImageRows,
    ratioRows,
    quantileRows,
    transformRows,
    timeseriesRows,
  ] = await Promise.all([
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          blob1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${scopeClause}
        GROUP BY key
        ORDER BY request_count DESC
        LIMIT 25
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          index1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND blob2 IN ('edge-hit', 'r2-derived-hit', 'transform-miss')
          AND ${scopeClause}
        GROUP BY key
        ORDER BY request_count DESC
        LIMIT 25
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          index1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND blob2 = 'not-found'
          AND ${scopeClause}
        GROUP BY key
        ORDER BY request_count DESC
        LIMIT 25
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          index1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND blob2 = 'server-error'
          AND ${scopeClause}
        GROUP BY key
        ORDER BY request_count DESC
        LIMIT 25
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsRatiosRow>(
      env,
      `
        SELECT
          sum(_sample_interval) AS total_requests,
          sumIf(_sample_interval, blob2 = 'edge-hit') AS edge_hit_requests,
          sumIf(_sample_interval, blob2 = 'r2-derived-hit') AS derived_hit_requests,
          sumIf(_sample_interval, blob2 = 'transform-miss') AS transform_miss_requests,
          sumIf(_sample_interval, blob2 = 'not-found') AS not_found_requests,
          sumIf(_sample_interval, blob2 = 'server-error') AS server_error_requests
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${scopeClause}
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsQuantilesRow>(
      env,
      `
        SELECT
          blob2 AS cache_status,
          quantileExactWeighted(0.50)(double1, _sample_interval) AS p50_total_ms,
          quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_total_ms,
          quantileExactWeighted(0.99)(double1, _sample_interval) AS p99_total_ms,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND blob2 IN ('edge-hit', 'r2-derived-hit', 'transform-miss')
          AND ${scopeClause}
        GROUP BY cache_status
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          blob1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${scopeClause}
        GROUP BY key
        ORDER BY request_count DESC
        LIMIT 500
        FORMAT JSON
      `,
    ),
    intervalExpression === ASSET_ANALYTICS_WINDOWS['30d']
      ? queryAnalyticsRows<AnalyticsTimeseriesRow>(
          env,
          `
            SELECT
              toDate(timestamp) AS date,
              blob2 AS cache_status,
              sum(_sample_interval) AS request_count
            FROM ${ASSET_ANALYTICS_DATASET}
            WHERE timestamp > NOW() - ${intervalExpression}
              AND blob3 = ${toSqlString(environment)}
              AND ${scopeClause}
            GROUP BY date, cache_status
            ORDER BY date ASC
            FORMAT JSON
          `,
        )
      : Promise.resolve([]),
  ])

  const ratioRow = ratioRows[0]
  const totalRequests = toSafeNumber(ratioRow?.total_requests)
  const edgeHitRequests = toSafeNumber(ratioRow?.edge_hit_requests)
  const derivedHitRequests = toSafeNumber(ratioRow?.derived_hit_requests)
  const transformMissRequests = toSafeNumber(ratioRow?.transform_miss_requests)
  const notFoundRequests = toSafeNumber(ratioRow?.not_found_requests)
  const serverErrorRequests = toSafeNumber(ratioRow?.server_error_requests)
  const breakdowns = toAnalyticsBreakdowns(transformRows, totalRequests)

  return {
    cacheHitPercent: toPercent(edgeHitRequests, totalRequests),
    derivedHitPercent: toPercent(derivedHitRequests, totalRequests),
    derivedMissPercent: toPercent(transformMissRequests, totalRequests),
    notFoundPercent: toPercent(notFoundRequests, totalRequests),
    serverErrorPercent: toPercent(serverErrorRequests, totalRequests),
    p50Ms: {
      cache: findQuantileForStatus(quantileRows, 'edge-hit', 'p50_total_ms'),
      derivedHit: findQuantileForStatus(quantileRows, 'r2-derived-hit', 'p50_total_ms'),
      derivedMiss: findQuantileForStatus(
        quantileRows,
        'transform-miss',
        'p50_total_ms',
      ),
      notFound: findQuantileForStatus(quantileRows, 'not-found', 'p50_total_ms'),
      serverError: findQuantileForStatus(quantileRows, 'server-error', 'p50_total_ms'),
    },
    p95Ms: {
      cache: findQuantileForStatus(quantileRows, 'edge-hit', 'p95_total_ms'),
      derivedHit: findQuantileForStatus(quantileRows, 'r2-derived-hit', 'p95_total_ms'),
      derivedMiss: findQuantileForStatus(
        quantileRows,
        'transform-miss',
        'p95_total_ms',
      ),
      notFound: findQuantileForStatus(quantileRows, 'not-found', 'p95_total_ms'),
      serverError: findQuantileForStatus(quantileRows, 'server-error', 'p95_total_ms'),
    },
    p99Ms: {
      cache: findQuantileForStatus(quantileRows, 'edge-hit', 'p99_total_ms'),
      derivedHit: findQuantileForStatus(quantileRows, 'r2-derived-hit', 'p99_total_ms'),
      derivedMiss: findQuantileForStatus(
        quantileRows,
        'transform-miss',
        'p99_total_ms',
      ),
      notFound: findQuantileForStatus(quantileRows, 'not-found', 'p99_total_ms'),
      serverError: findQuantileForStatus(quantileRows, 'server-error', 'p99_total_ms'),
    },
    timeseries30d: toAnalyticsTimeseries(timeseriesRows),
    breakdowns,
    topImages: topImageRows
      .map(row => ({
        publicId: row.key ?? '',
        requests: toSafeNumber(row.request_count),
      }))
      .filter(row => row.publicId.length > 0),
    topMissingImages: topMissingImageRows
      .map(row => ({
        publicId: row.key ?? '',
        requests: toSafeNumber(row.request_count),
      }))
      .filter(row => row.publicId.length > 0),
    topServerErrorImages: topServerErrorImageRows
      .map(row => ({
        publicId: row.key ?? '',
        requests: toSafeNumber(row.request_count),
      }))
      .filter(row => row.publicId.length > 0),
    topTransformations: topTransformRows
      .map(row => ({
        requests: toSafeNumber(row.request_count),
        transformKey: row.key ?? '',
      }))
      .filter(row => row.transformKey.length > 0),
    totalRequests,
  }
}

/**
 * Executes a SQL query against the Analytics Engine REST API.
 *
 * @param env Worker bindings and secrets.
 * @param sql SQL statement to execute.
 * @returns Parsed result rows.
 */
const queryAnalyticsRows = async <TRow>(env: Env, sql: string): Promise<TRow[]> => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      env.CLOUDFLARE_ACCOUNT_ID ?? '',
    )}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_API_TOKEN ?? ''}`,
        'content-type': 'text/plain',
      },
      body: sql.trim(),
    },
  )

  if (!response.ok) {
    throw new Error(
      `Analytics query failed (${response.status} ${response.statusText}): ${await response.text()}`,
    )
  }

  const payload = (await response.json()) as {
    data?: TRow[]
    errors?: Array<{ message?: string }>
    result?: { data?: TRow[] } | TRow[]
    success?: boolean
  }

  if (payload.success === false) {
    const message = payload.errors
      ?.map(error => error.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(message || 'Analytics query returned an unsuccessful result')
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  if (Array.isArray(payload.result)) {
    return payload.result
  }

  if (payload.result && Array.isArray(payload.result.data)) {
    return payload.result.data
  }

  return []
}

/**
 * Writes an asset delivery outcome event to Analytics Engine without blocking the response path.
 *
 * @param env Worker bindings.
 * @param event Structured delivery event.
 * @returns Nothing.
 */
const recordAssetAnalytics = (env: Env, event: AssetAnalyticsEvent): void => {
  env.ASSET_ANALYTICS.writeDataPoint({
    indexes: [toAssetAnalyticsPublicId(event.publicId)],
    blobs: [
      event.transformKey,
      event.analyticsStatus,
      event.requestedStage,
      event.sourceStage,
      event.outputFormat,
      event.version ? String(event.version) : null,
    ],
    doubles: [event.totalMs, event.contentLength],
  })
}

/**
 * Writes image warmup lifecycle events to Analytics Engine.
 *
 * @param env Worker bindings.
 * @param event Structured warmup event.
 * @returns Nothing.
 */
const recordAssetWarmupAnalytics = (
  env: Env,
  event: {
    type: AssetWarmupAnalyticsEventType
    publicId: string
    requestedStage: ImageStage
    resolvedStage?: ImageStage | null
    sourceExtension?: string | null
    variantKind?: 'rawIntermediate' | 'prerender' | 'image' | null
    status?: number | null
    version?: number | null
    queueRetry?: boolean
    requestedCount?: number
    failedCount?: number
  },
): void => {
  env.ASSET_WARMUP_ANALYTICS.writeDataPoint({
    indexes: [toAssetAnalyticsPublicId(event.publicId)],
    blobs: [
      event.type,
      event.requestedStage,
      event.resolvedStage ?? null,
      event.sourceExtension ?? null,
      event.variantKind ?? null,
      event.version != null ? String(event.version) : null,
      event.queueRetry ? 'true' : 'false',
    ],
    doubles: [event.status ?? 0, event.requestedCount ?? 0, event.failedCount ?? 0],
  })
}

/**
 * Escapes a string literal for an Analytics Engine SQL statement.
 *
 * @param value Untrusted string value.
 * @returns Quoted SQL string literal.
 */
const toSqlString = (value: string): string => `'${value.replace(/'/g, "''")}'`

/**
 * Converts a sampled count or duration into a finite number.
 *
 * @param value Numeric or string result value.
 * @returns Finite number or zero.
 */
const toSafeNumber = (value: number | string | null | undefined): number => {
  const numericValue =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numericValue) ? numericValue : 0
}

/**
 * Converts a weighted count into a percentage of the window total.
 *
 * @param value Partial count.
 * @param total Window total count.
 * @returns Percentage with two decimal precision.
 */
const toPercent = (value: number, total: number): number => {
  if (total <= 0) {
    return 0
  }

  return Math.round((value / total) * 10000) / 100
}

const toDisplayCropMode = (value: string): string => {
  const normalized = value.toLowerCase()
  if (normalized === 'fill' || normalized === 'cover') return 'Fill'
  if (normalized === 'fit' || normalized === 'contain') return 'Fit'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const toDisplayGravity = (value: string): string =>
  `G:${value.charAt(0).toUpperCase()}${value.slice(1)}`

const toDisplayQuality = (value: string): string =>
  `Q:${value === 'auto' ? 'Auto' : value}`

const toDisplayFormat = (value: string): string => value.toUpperCase()

const createBreakdownAccumulator = (): AnalyticsBreakdownAccumulator => ({
  cropModes: new Map(),
  formats: new Map(),
  dimensions: new Map(),
  qualities: new Map(),
  gravities: new Map(),
})

const addBreakdownValue = (
  map: Map<string, number>,
  key: string,
  requests: number,
): void => {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + requests)
}

const toAnalyticsBreakdownItems = (
  values: Map<string, number>,
  totalRequests: number,
): Array<{ key: string; label: string; requests: number; percent: number }> =>
  Array.from(values.entries())
    .map(([label, requests]) => ({
      key: label,
      label,
      requests,
      percent: toPercent(requests, totalRequests),
    }))
    .sort((left, right) => right.requests - left.requests)

const toAnalyticsBreakdowns = (
  rows: AnalyticsTopRow[],
  totalRequests: number,
): AnalyticsWindowSummary['breakdowns'] => {
  const breakdowns = createBreakdownAccumulator()

  for (const row of rows) {
    const transformKey = row.key ?? ''
    const requests = toSafeNumber(row.request_count)
    if (!transformKey || requests <= 0) continue

    const tokens = transformKey
      .split(',')
      .map(token => token.trim())
      .filter(Boolean)

    let width: string | null = null
    let height: string | null = null

    for (const token of tokens) {
      if (token.startsWith('c_')) {
        addBreakdownValue(
          breakdowns.cropModes,
          toDisplayCropMode(token.slice(2)),
          requests,
        )
        continue
      }
      if (token.startsWith('fit=')) {
        addBreakdownValue(
          breakdowns.cropModes,
          toDisplayCropMode(token.slice('fit='.length)),
          requests,
        )
        continue
      }
      if (token.startsWith('g_')) {
        addBreakdownValue(
          breakdowns.gravities,
          toDisplayGravity(token.slice(2)),
          requests,
        )
        continue
      }
      if (token.startsWith('gravity=')) {
        addBreakdownValue(
          breakdowns.gravities,
          toDisplayGravity(token.slice('gravity='.length)),
          requests,
        )
        continue
      }
      if (token.startsWith('q_')) {
        addBreakdownValue(
          breakdowns.qualities,
          toDisplayQuality(token.slice(2)),
          requests,
        )
        continue
      }
      if (token.startsWith('quality=')) {
        addBreakdownValue(
          breakdowns.qualities,
          toDisplayQuality(token.slice('quality='.length)),
          requests,
        )
        continue
      }
      if (token.startsWith('f_')) {
        addBreakdownValue(breakdowns.formats, toDisplayFormat(token.slice(2)), requests)
        continue
      }
      if (token.startsWith('format=')) {
        addBreakdownValue(
          breakdowns.formats,
          toDisplayFormat(token.slice('format='.length)),
          requests,
        )
        continue
      }
      if (token.startsWith('w_') || token.startsWith('w=')) {
        width = token.slice(2)
        continue
      }
      if (token.startsWith('width=')) {
        width = token.slice('width='.length)
        continue
      }
      if (token.startsWith('h_') || token.startsWith('h=')) {
        height = token.slice(2)
        continue
      }
      if (token.startsWith('height=')) {
        height = token.slice('height='.length)
      }
    }

    if (width || height) {
      addBreakdownValue(
        breakdowns.dimensions,
        width && height
          ? `${width}x${height}`
          : width
            ? `W:${width}`
            : `H:${height ?? ''}`,
        requests,
      )
    }
  }

  return {
    cropModes: toAnalyticsBreakdownItems(breakdowns.cropModes, totalRequests),
    formats: toAnalyticsBreakdownItems(breakdowns.formats, totalRequests),
    dimensions: toAnalyticsBreakdownItems(breakdowns.dimensions, totalRequests),
    qualities: toAnalyticsBreakdownItems(breakdowns.qualities, totalRequests),
    gravities: toAnalyticsBreakdownItems(breakdowns.gravities, totalRequests),
  }
}

const toAnalyticsTimeseries = (
  rows: AnalyticsTimeseriesRow[],
): AnalyticsWindowSummary['timeseries30d'] => {
  const byDate = new Map<
    string,
    {
      date: string
      totalRequests: number
      cacheRequests: number
      derivedHitRequests: number
      derivedMissRequests: number
      notFoundRequests: number
      serverErrorRequests: number
    }
  >()

  for (const row of rows) {
    const date = row.date ?? ''
    if (!date) continue

    const entry = byDate.get(date) ?? {
      date,
      totalRequests: 0,
      cacheRequests: 0,
      derivedHitRequests: 0,
      derivedMissRequests: 0,
      notFoundRequests: 0,
      serverErrorRequests: 0,
    }
    const requests = toSafeNumber(row.request_count)
    entry.totalRequests += requests

    if (row.cache_status === 'edge-hit') {
      entry.cacheRequests += requests
    } else if (row.cache_status === 'r2-derived-hit') {
      entry.derivedHitRequests += requests
    } else if (row.cache_status === 'transform-miss') {
      entry.derivedMissRequests += requests
    } else if (row.cache_status === 'not-found') {
      entry.notFoundRequests += requests
    } else if (row.cache_status === 'server-error') {
      entry.serverErrorRequests += requests
    }

    byDate.set(date, entry)
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  )
}

/**
 * Finds a latency quantile for a specific cache status bucket.
 *
 * @param rows Status-grouped quantile rows.
 * @param status Requested cache status.
 * @param field Requested quantile field.
 * @returns Quantile latency or null.
 */
const findQuantileForStatus = (
  rows: AnalyticsQuantilesRow[],
  status: ImageCacheStatus,
  field: 'p50_total_ms' | 'p95_total_ms' | 'p99_total_ms',
): number | null => {
  const row = rows.find(candidate => candidate.cache_status === status)
  if (!row || toSafeNumber(row.request_count) <= 0) {
    return null
  }

  return toSafeNumber(row[field])
}

/**
 * Resolves metadata sidecars from originals buckets and returns the requested profile.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param metadataRequest Parsed metadata request.
 * @returns Metadata response.
 */
const handleMetadataRequest = async (
  request: Request,
  env: Env,
  metadataRequest: MetadataRequest,
): Promise<Response> => {
  const resolved = await resolveMetadataDocument(env, metadataRequest.requestedStage, {
    publicId: metadataRequest.publicId,
    version: metadataRequest.version,
  })

  if (!resolved.document) {
    return Response.json({ error: 'Metadata not found' }, { status: 404 })
  }

  if (resolved.stage !== metadataRequest.requestedStage) {
    console.warn(
      JSON.stringify({
        event: 'cross-stage-image-read',
        requestedStage: metadataRequest.requestedStage,
        resolvedStage: resolved.stage,
        publicId: metadataRequest.publicId,
      }),
    )
  }

  const headers = {
    'cache-control': resolved.version ? CACHE_CONTROL_IMMUTABLE : CACHE_CONTROL_SHORT,
    'content-type': 'application/json; charset=utf-8',
    'x-image-source-env': resolved.stage,
    ...(resolved.version ? { 'x-image-version': String(resolved.version) } : {}),
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  return Response.json(
    toMetadataProfilePayload(resolved.document, metadataRequest.profile),
    {
      headers,
    },
  )
}

const handleRawRequest = async (
  request: Request,
  env: Env,
  rawRequest: RawRequest,
): Promise<Response> => {
  if (typeof rawRequest.width === 'number' || typeof rawRequest.height === 'number') {
    const source = await resolveIntermediateAsset(env, rawRequest.requestedStage, {
      publicId: rawRequest.publicId,
      version: rawRequest.version,
    })

    if (!source) {
      return new Response('Image not found', { status: 404 })
    }

    return new Response(request.method === 'HEAD' ? null : source.body, {
      headers: {
        'cache-control': source.version ? CACHE_CONTROL_IMMUTABLE : CACHE_CONTROL_SHORT,
        'content-type': source.contentType,
        'x-image-source-env': source.stage,
        ...(source.version ? { 'x-image-version': String(source.version) } : {}),
      },
    })
  }

  const resolvedMetadata = await resolveMetadataDocument(
    env,
    rawRequest.requestedStage,
    {
      publicId: rawRequest.publicId,
      version: rawRequest.version,
    },
  )
  const source = await resolveRawDownloadAsset(env, rawRequest.requestedStage, {
    publicId: rawRequest.publicId,
    version: rawRequest.version,
  })

  if (!source) {
    return new Response('Image not found', { status: 404 })
  }

  const filename = toRawDownloadFilename(
    rawRequest.publicId,
    source.objectKey,
    source.contentType,
    resolvedMetadata.document,
  )

  return new Response(request.method === 'HEAD' ? null : source.body, {
    headers: {
      'cache-control': source.version ? CACHE_CONTROL_IMMUTABLE : CACHE_CONTROL_SHORT,
      'content-type': source.contentType,
      'content-disposition': `attachment; filename="${filename}"`,
      'x-image-source-env': source.stage,
      ...(source.version ? { 'x-image-version': String(source.version) } : {}),
    },
  })
}

/**
 * Resolves the normalized working object used by the raw intermediate route.
 *
 * @param env Worker bindings.
 * @param requestedStage Requested environment.
 * @param lookup Public id and optional version.
 * @returns Intermediate asset bytes or null when absent.
 */
const resolveIntermediateAsset = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<SourceAsset | null> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined
    const object = await bucket.get(lookup.publicId)
    if (!object) {
      continue
    }

    return {
      body: await object.arrayBuffer(),
      contentType:
        object.httpMetadata?.contentType ?? inferContentTypeFromKey(lookup.publicId),
      objectKey: lookup.publicId,
      stage,
      version,
    }
  }

  return null
}

/**
 * Resolves or generates a transformed image, then persists the derived variant to R2.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param ctx Execution context.
 * @param transformRequest Parsed transform request.
 * @returns Image response.
 */
const handleTransformRequest = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  transformRequest: TransformRequest,
): Promise<Response> => {
  const startedAt = Date.now()
  const cacheKey = toEdgeCacheKey(request)
  const debug: TransformDebugContext = {
    enabled: isTransformDebugEnabled(env, request, transformRequest),
    publicId: transformRequest.publicId,
    requestedStage: transformRequest.requestedStage,
    requestPath: new URL(request.url).pathname,
  }
  const bypassCacheReads = isDebugTransformRequest(debug)

  if (bypassCacheReads) {
    logTransformDebug(debug, 'cache-bypassed', {
      reason: 'debug-request',
      cacheLayers: ['edge', 'derived'],
    })
  }

  const edgeCached = bypassCacheReads ? null : await caches.default.match(cacheKey)
  if (edgeCached) {
    const response = withImageDebugHeaders(
      toHeadAwareResponse(edgeCached, request.method),
      {
        cacheStatus: 'edge-hit',
        totalMs: Date.now() - startedAt,
      },
    )
    maybeRecordAssetAnalytics(env, request, response, {
      cacheStatus: 'edge-hit',
      outputFormat: getResponseOutputFormat(response),
      publicId: transformRequest.publicId,
      requestedStage: transformRequest.requestedStage,
      sourceStage: toResponseSourceStage(response, transformRequest.requestedStage),
      totalMs: Date.now() - startedAt,
      transformKey:
        response.headers.get('x-image-transform-key') ??
        toCanonicalTransformKey({
          ...transformRequest,
          format: chooseOutputFormatFromRequest(request, transformRequest.format),
        }),
      version: toNumericHeader(response.headers.get('x-image-version')),
    })
    return response
  }

  const versionStartedAt = Date.now()
  const manifestVersion = await resolveVersionHint(
    env,
    transformRequest.requestedStage,
    {
      publicId: transformRequest.publicId,
      version: transformRequest.version,
    },
  )
  const resolvedVersion = manifestVersion ?? transformRequest.version ?? undefined
  const outputFormatGuess = chooseOutputFormatFromRequest(
    request,
    transformRequest.format,
  )
  const optimisticCanonical = toCanonicalTransformKey({
    ...transformRequest,
    format: outputFormatGuess,
    version: resolvedVersion,
  })
  const optimisticDerivedKey = toDerivedObjectKey({
    publicId: transformRequest.publicId,
    version: resolvedVersion,
    canonicalKey: optimisticCanonical,
  })
  const derivedBucket = getDerivedBucket(env, transformRequest.requestedStage)

  const derivedLookupStartedAt = Date.now()
  const optimisticCached = bypassCacheReads
    ? null
    : await derivedBucket.get(optimisticDerivedKey)
  if (optimisticCached) {
    const response = withImageDebugHeaders(
      toObjectResponse(optimisticCached, {
        method: request.method,
        stage: transformRequest.requestedStage,
        version: resolvedVersion,
        canonicalKey: optimisticCanonical,
      }),
      {
        cacheStatus: 'r2-derived-hit',
        totalMs: Date.now() - startedAt,
        versionMs: derivedLookupStartedAt - versionStartedAt,
        derivedLookupMs: Date.now() - derivedLookupStartedAt,
      },
    )
    maybeRecordAssetAnalytics(env, request, response, {
      cacheStatus: 'r2-derived-hit',
      outputFormat: outputFormatGuess,
      publicId: transformRequest.publicId,
      requestedStage: transformRequest.requestedStage,
      sourceStage: transformRequest.requestedStage,
      totalMs: Date.now() - startedAt,
      transformKey: optimisticCanonical,
      version: resolvedVersion,
    })
    if (request.method === 'GET') {
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
    }
    return response
  }

  const queueStartedAt = Date.now()
  const releaseTransformSlot = tryAcquireTransformSlot()
  const queueMs = Date.now() - queueStartedAt

  if (!releaseTransformSlot) {
    const response = new Response('Asset transform capacity exceeded', {
      status: 503,
      headers: {
        'retry-after': String(TRANSFORM_QUEUE_RETRY_AFTER_SECONDS),
      },
    })

    maybeRecordAssetAnalytics(env, request, response, {
      cacheStatus: 'transform-miss',
      outputFormat: outputFormatGuess,
      publicId: transformRequest.publicId,
      requestedStage: transformRequest.requestedStage,
      sourceStage: transformRequest.requestedStage,
      totalMs: Date.now() - startedAt,
      transformKey: optimisticCanonical,
      version: resolvedVersion,
    })

    return response
  }

  try {
    // Re-check the cheap derived path after queueing because another request may have filled it.
    const queuedOptimisticCached = bypassCacheReads
      ? null
      : await derivedBucket.get(optimisticDerivedKey)
    if (queuedOptimisticCached) {
      const response = withImageDebugHeaders(
        toObjectResponse(queuedOptimisticCached, {
          method: request.method,
          stage: transformRequest.requestedStage,
          version: resolvedVersion,
          canonicalKey: optimisticCanonical,
        }),
        {
          cacheStatus: 'r2-derived-hit',
          totalMs: Date.now() - startedAt,
          queueMs,
          versionMs: derivedLookupStartedAt - versionStartedAt,
          derivedLookupMs: Date.now() - derivedLookupStartedAt,
        },
      )
      maybeRecordAssetAnalytics(env, request, response, {
        cacheStatus: 'r2-derived-hit',
        outputFormat: outputFormatGuess,
        publicId: transformRequest.publicId,
        requestedStage: transformRequest.requestedStage,
        sourceStage: transformRequest.requestedStage,
        totalMs: Date.now() - startedAt,
        transformKey: optimisticCanonical,
        version: resolvedVersion,
      })
      if (request.method === 'GET') {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
      }
      return response
    }

    const sourceStartedAt = Date.now()
    const source = await resolveSourceAsset(env, transformRequest.requestedStage, {
      publicId: transformRequest.publicId,
      version: resolvedVersion,
    })
    if (!source) {
      const response = new Response('Image not found', { status: 404 })
      maybeRecordAssetAnalytics(env, request, response, {
        cacheStatus: 'transform-miss',
        outputFormat: outputFormatGuess,
        publicId: transformRequest.publicId,
        requestedStage: transformRequest.requestedStage,
        sourceStage: transformRequest.requestedStage,
        totalMs: Date.now() - startedAt,
        transformKey: optimisticCanonical,
        version: resolvedVersion,
      })
      return response
    }

    logTransformDebug(debug, 'source-loaded', {
      sourceStage: source.stage,
      sourceContentType: source.contentType,
      sourceBytes: source.body.byteLength,
      resolvedVersion: resolvedVersion ?? null,
    })

    if (source.stage !== transformRequest.requestedStage) {
      console.warn(
        JSON.stringify({
          event: 'cross-stage-image-read',
          requestedStage: transformRequest.requestedStage,
          resolvedStage: source.stage,
          publicId: transformRequest.publicId,
        }),
      )
    }

    const outputFormat = chooseOutputFormat(
      request,
      source.contentType,
      transformRequest.format,
    )
    logTransformDebug(debug, 'format-selected', {
      sourceContentType: source.contentType,
      sourceBytes: source.body.byteLength,
      outputFormat,
      accept: request.headers.get('accept') ?? '',
      requestMethod: request.method,
    })
    const canonical = toCanonicalTransformKey({
      ...transformRequest,
      format: outputFormat,
      version: resolvedVersion,
    })
    const derivedKey = toDerivedObjectKey({
      publicId: transformRequest.publicId,
      version: resolvedVersion,
      canonicalKey: canonical,
    })
    const secondDerivedLookupStartedAt = Date.now()
    const cached = bypassCacheReads ? null : await derivedBucket.get(derivedKey)
    if (cached) {
      const response = withImageDebugHeaders(
        toObjectResponse(cached, {
          method: request.method,
          stage: source.stage,
          version: resolvedVersion,
          canonicalKey: canonical,
        }),
        {
          cacheStatus: 'r2-derived-hit',
          totalMs: Date.now() - startedAt,
          queueMs,
          versionMs: derivedLookupStartedAt - versionStartedAt,
          sourceMs: secondDerivedLookupStartedAt - sourceStartedAt,
          derivedLookupMs: Date.now() - secondDerivedLookupStartedAt,
        },
      )
      maybeRecordAssetAnalytics(env, request, response, {
        cacheStatus: 'r2-derived-hit',
        outputFormat,
        publicId: transformRequest.publicId,
        requestedStage: transformRequest.requestedStage,
        sourceStage: source.stage,
        totalMs: Date.now() - startedAt,
        transformKey: canonical,
        version: resolvedVersion,
      })
      if (request.method === 'GET') {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
      }
      return response
    }

    if (shouldBlockProductionAutoTransformMiss(env, transformRequest)) {
      const response = withImageDebugHeaders(
        new Response('Production auto transforms must be pre-rendered', {
          status: 404,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=UTF-8',
            'x-image-transform-key': canonical,
            ...(resolvedVersion ? { 'x-image-version': String(resolvedVersion) } : {}),
          },
        }),
        {
          cacheStatus: 'transform-miss',
          totalMs: Date.now() - startedAt,
          queueMs,
          versionMs: derivedLookupStartedAt - versionStartedAt,
          derivedLookupMs: Date.now() - secondDerivedLookupStartedAt,
        },
      )
      maybeRecordAssetAnalytics(env, request, response, {
        cacheStatus: 'transform-miss',
        outputFormat,
        publicId: transformRequest.publicId,
        requestedStage: transformRequest.requestedStage,
        sourceStage: source.stage,
        totalMs: Date.now() - startedAt,
        transformKey: canonical,
        version: resolvedVersion,
      })
      return response
    }

    const transformStartedAt = Date.now()
    let transformed: { body: ArrayBuffer; contentType: string }

    try {
      transformed = await transformSourceAsset(
        source,
        {
          ...transformRequest,
          version: resolvedVersion,
          format: outputFormat,
        },
        debug,
      )
    } catch (error) {
      const stageError = error instanceof AssetTransformStageError ? error : null

      console.error(
        JSON.stringify({
          event: 'asset-transform-failed',
          requestedStage: transformRequest.requestedStage,
          sourceStage: source.stage,
          publicId: transformRequest.publicId,
          sourceContentType: source.contentType,
          phase: stageError?.phase ?? null,
          details: stageError?.details ?? null,
          error: error instanceof Error ? error.message : String(error),
        }),
      )

      if (debug.enabled) {
        const debugPayload = {
          error: 'Unsupported or invalid source asset data',
          phase: stageError?.phase ?? null,
          details: stageError?.details ?? null,
          message: error instanceof Error ? error.message : String(error),
        }

        return new Response(
          request.method === 'HEAD' ? null : JSON.stringify(debugPayload, null, 2),
          {
            status: 415,
            headers: {
              'cache-control': 'no-store',
              'content-type': 'application/json; charset=utf-8',
              ...(stageError?.phase
                ? { 'x-image-debug-failure-phase': stageError.phase }
                : {}),
            },
          },
        )
      }

      return new Response('Unsupported or invalid source asset data', {
        status: 415,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      })
    }

    const response = withImageDebugHeaders(
      new Response(request.method === 'HEAD' ? null : transformed.body, {
        headers: {
          'cache-control': CACHE_CONTROL_IMMUTABLE,
          'content-type': transformed.contentType,
          vary: 'Accept',
          'x-image-source-env': source.stage,
          'x-image-transform-key': canonical,
          ...(resolvedVersion ? { 'x-image-version': String(resolvedVersion) } : {}),
        },
      }),
      {
        cacheStatus: 'transform-miss',
        totalMs: Date.now() - startedAt,
        queueMs,
        versionMs: derivedLookupStartedAt - versionStartedAt,
        sourceMs: secondDerivedLookupStartedAt - sourceStartedAt,
        derivedLookupMs: transformStartedAt - secondDerivedLookupStartedAt,
        transformMs: Date.now() - transformStartedAt,
      },
    )

    maybeRecordAssetAnalytics(env, request, response, {
      cacheStatus: 'transform-miss',
      contentLength: transformed.body.byteLength,
      outputFormat,
      publicId: transformRequest.publicId,
      requestedStage: transformRequest.requestedStage,
      sourceStage: source.stage,
      totalMs: Date.now() - startedAt,
      transformKey: canonical,
      version: resolvedVersion,
    })

    if (!bypassCacheReads) {
      ctx.waitUntil(
        Promise.all([
          derivedBucket.put(derivedKey, transformed.body, {
            httpMetadata: {
              contentType: transformed.contentType,
              cacheControl: CACHE_CONTROL_IMMUTABLE,
            },
            customMetadata: {
              sourceStage: source.stage,
              sourceObjectKey: source.objectKey,
              publicId: transformRequest.publicId,
              version: resolvedVersion ? String(resolvedVersion) : 'latest',
              canonicalTransform: canonical,
              generatedAt: new Date().toISOString(),
            },
          }),
          ...(request.method === 'GET'
            ? [caches.default.put(cacheKey, response.clone())]
            : []),
        ]),
      )
    }

    return response
  } finally {
    releaseTransformSlot()
  }
}

const withImageDebugHeaders = (
  response: Response,
  metrics: ImageResponseMetrics,
): Response => {
  const headers = new Headers(response.headers)
  headers.set('x-image-cache-status', metrics.cacheStatus)
  headers.set('x-image-total-ms', String(metrics.totalMs))
  headers.delete('x-image-queue-ms')
  headers.delete('x-image-version-ms')
  headers.delete('x-image-source-ms')
  headers.delete('x-image-derived-lookup-ms')
  headers.delete('x-image-transform-ms')

  if (metrics.queueMs !== undefined) {
    headers.set('x-image-queue-ms', String(metrics.queueMs))
  }
  if (metrics.versionMs !== undefined) {
    headers.set('x-image-version-ms', String(metrics.versionMs))
  }
  if (metrics.sourceMs !== undefined) {
    headers.set('x-image-source-ms', String(metrics.sourceMs))
  }

  if (metrics.derivedLookupMs !== undefined) {
    headers.set('x-image-derived-lookup-ms', String(metrics.derivedLookupMs))
  }

  if (metrics.transformMs !== undefined) {
    headers.set('x-image-transform-ms', String(metrics.transformMs))
  }

  const serverTiming = [
    `total;dur=${metrics.totalMs}`,
    ...(metrics.queueMs !== undefined ? [`queue;dur=${metrics.queueMs}`] : []),
    ...(metrics.versionMs !== undefined ? [`version;dur=${metrics.versionMs}`] : []),
    ...(metrics.sourceMs !== undefined ? [`source;dur=${metrics.sourceMs}`] : []),
    ...(metrics.derivedLookupMs !== undefined
      ? [`derived;dur=${metrics.derivedLookupMs}`]
      : []),
    ...(metrics.transformMs !== undefined
      ? [`transform;dur=${metrics.transformMs}`]
      : []),
  ].join(', ')
  headers.set('server-timing', serverTiming)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Emits asset delivery analytics for successful, missing, and server-error GET requests.
 *
 * @param env Worker bindings.
 * @param request Incoming request.
 * @param response Outgoing response.
 * @param event Partial analytics payload.
 * @returns Nothing.
 */
const maybeRecordAssetAnalytics = (
  env: Env,
  request: Request,
  response: Response,
  event: Omit<AssetAnalyticsEvent, 'contentLength'> & { contentLength?: number },
): void => {
  if (request.method !== 'GET') {
    return
  }

  const analyticsStatus =
    response.status === 404
      ? 'not-found'
      : response.status >= 500
        ? 'server-error'
        : response.status >= 200 && response.status < 300
          ? event.cacheStatus
          : null

  if (!analyticsStatus) {
    return
  }

  recordAssetAnalytics(env, {
    ...event,
    analyticsStatus,
    contentLength:
      event.contentLength ?? toSafeNumber(response.headers.get('content-length')) ?? 0,
  })
}

/**
 * Infers an output format from a response content type.
 *
 * @param response Image response.
 * @returns Output format.
 */
const getResponseOutputFormat = (response: Response): OutputFormat => {
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (contentType.includes('image/avif')) return 'avif'
  if (contentType.includes('image/jxl')) return 'jxl'
  if (contentType.includes('image/png')) return 'png'
  if (contentType.includes('image/svg+xml')) return 'svg'
  if (contentType.includes('image/webp')) return 'webp'
  return 'jpeg'
}

/**
 * Reads the source stage debug header while preserving a safe fallback.
 *
 * @param response Image response.
 * @param fallbackStage Fallback stage.
 * @returns Resolved stage.
 */
const toResponseSourceStage = (
  response: Response,
  fallbackStage: ImageStage,
): ImageStage => {
  const headerValue = response.headers.get('x-image-source-env')
  return headerValue === 'local' ||
    headerValue === 'preview' ||
    headerValue === 'production'
    ? headerValue
    : fallbackStage
}

/**
 * Parses a numeric header without throwing.
 *
 * @param value Header string.
 * @returns Parsed number or undefined.
 */
const toNumericHeader = (value: string | null): number | undefined => {
  const numericValue = value === null ? NaN : Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

/**
 * Caps concurrent source decode / transform work to avoid worker OOMs on large cold batches.
 *
 * @returns Release callback for the acquired slot, or `null` when the worker is saturated.
 */
const tryAcquireTransformSlot = (): (() => void) | null => {
  if (activeTransformCount < MAX_CONCURRENT_TRANSFORMS) {
    activeTransformCount += 1
    return releaseTransformSlot
  }

  return null
}

/**
 * Releases one transform slot.
 */
const releaseTransformSlot = (): void => {
  activeTransformCount = Math.max(0, activeTransformCount - 1)
}

const resolveVersionHint = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<number | null> => {
  if (typeof lookup.version === 'number') {
    return lookup.version
  }

  for (const stage of getReadableStages(requestedStage)) {
    const version = await readManifestVersion(
      getOriginalsBucket(env, stage),
      lookup.publicId,
    )
    if (typeof version === 'number') {
      return version
    }
  }

  return null
}

const chooseOutputFormatFromRequest = (
  request: Request,
  requestedFormat: 'auto' | OutputFormat,
): OutputFormat => {
  if (requestedFormat !== 'auto') {
    return requestedFormat
  }

  const accept = request.headers.get('accept') ?? ''
  return chooseAutoOutputFormat(accept)
}

/**
 * Parses the metadata URL family and normalizes aliases into a stable request shape.
 *
 * @param requestedStage Requested environment segment.
 * @param rawSegments Remaining path segments after `/image/metadata/`.
 * @returns Parsed metadata request or an error.
 */
const parseMetadataRequest = (
  requestedStage: ImageStage,
  rawSegments: string[],
): { ok: true; value: MetadataRequest } | { ok: false; error: string } => {
  if (rawSegments.length === 0) {
    return { ok: false, error: 'Missing metadata path' }
  }

  let version: number | undefined
  let profile: MetadataProfile = 'full'
  let format: 'json' = 'json'
  const publicIdSegments: string[] = []

  for (const segment of rawSegments) {
    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (segment.startsWith('p_')) {
      profile = toMetadataProfile(segment)
      continue
    }

    if (segment.startsWith('f_')) {
      format = toMetadataFormat(segment)
      continue
    }

    publicIdSegments.push(segment)
  }

  const publicId = publicIdSegments.join('/')
  if (!publicId) {
    return { ok: false, error: 'Missing publicId' }
  }

  return {
    ok: true,
    value: {
      requestedStage,
      publicId,
      version,
      profile,
      format,
    },
  }
}

const parseRawRequest = (
  requestedStage: ImageStage,
  rawSegments: string[],
): { ok: true; value: RawRequest } | { ok: false; error: string } => {
  if (rawSegments.length === 0) {
    return { ok: false, error: 'Missing raw image path' }
  }

  let version: number | undefined
  let width: number | undefined
  let height: number | undefined
  const publicIdSegments: string[] = []

  for (const segment of rawSegments) {
    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (looksLikeModifierSegment(segment)) {
      for (const part of segment.split(',')) {
        if (part.startsWith('w_') && isIntegerString(part.slice(2))) {
          width = clampDimension(Number(part.slice(2)))
          continue
        }

        if (part.startsWith('h_') && isIntegerString(part.slice(2))) {
          height = clampDimension(Number(part.slice(2)))
        }
      }
      continue
    }

    publicIdSegments.push(segment)
  }

  const publicId = publicIdSegments.join('/')
  if (!publicId) {
    return { ok: false, error: 'Missing publicId' }
  }

  return {
    ok: true,
    value: {
      requestedStage,
      publicId: stripKnownExtension(publicId),
      version,
      width,
      height,
    },
  }
}

/**
 * Parses Cloudinary-compatible image delivery paths and applies v1 defaults.
 *
 * @param requestedStage Requested environment segment.
 * @param rawSegments Remaining path segments after `/image/upload/`.
 * @returns Parsed transform request or an error.
 */
const parseTransformRequest = (
  requestedStage: ImageStage,
  rawSegments: string[],
): { ok: true; value: TransformRequest } | { ok: false; error: string } => {
  if (rawSegments.length === 0) {
    return { ok: false, error: 'Missing image path' }
  }

  let version: number | undefined
  let cropMode: CropMode = 'c_fit'
  let gravity: GravityMode = 'g_auto'
  let quality = 'q_auto'
  let format: 'auto' | OutputFormat = 'auto'
  let width: number | undefined
  let height: number | undefined
  const effects: string[] = []
  const publicIdSegments: string[] = []
  let modifiersComplete = false

  for (const segment of rawSegments) {
    if (modifiersComplete) {
      publicIdSegments.push(segment)
      continue
    }

    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (looksLikeModifierSegment(segment)) {
      const parts = segment.split(',')

      for (const part of parts) {
        if (part.startsWith('c_')) {
          cropMode = toCropMode(part)
          continue
        }

        if (part.startsWith('g_')) {
          gravity = toGravityMode(part)
          continue
        }

        if (part.startsWith('f_')) {
          format = toExplicitFormat(part)
          continue
        }

        if (part.startsWith('q_')) {
          quality = part
          continue
        }

        if (part.startsWith('w_')) {
          width = clampDimension(part.slice(2))
          continue
        }

        if (part.startsWith('h_')) {
          height = clampDimension(part.slice(2))
          continue
        }

        if (part.startsWith('e_')) {
          effects.push(part)
        }
      }
      continue
    }

    modifiersComplete = true
    publicIdSegments.push(segment)
  }

  if (publicIdSegments.length === 0) {
    return { ok: false, error: 'Missing publicId' }
  }

  const publicId = publicIdSegments.join('/')
  const explicitExtension = extractExtension(publicId)
  if (format === 'auto' && explicitExtension) {
    format = explicitExtension
  }

  return {
    ok: true,
    value: {
      requestedStage,
      publicId: stripKnownExtension(publicId),
      version,
      cropMode,
      gravity,
      quality,
      format,
      width,
      height,
      effects,
    },
  }
}

/**
 * Resolves a source asset from the readable stages for the requested environment.
 *
 * @param env Worker bindings.
 * @param requestedStage Requested stage from the URL.
 * @param lookup Public id and optional version.
 * @returns Source asset or null when missing.
 */
const resolveSourceAsset = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<SourceAsset | null> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined
    const object = await bucket.get(lookup.publicId)
    if (object) {
      return {
        body: await object.arrayBuffer(),
        contentType:
          object.httpMetadata?.contentType ?? inferContentTypeFromKey(lookup.publicId),
        objectKey: lookup.publicId,
        stage,
        version,
      }
    }

    const rawObjectKey = `${lookup.publicId}.raw`
    const rawObject = await bucket.get(rawObjectKey)
    if (!rawObject) {
      continue
    }

    const rawBody = await rawObject.arrayBuffer()
    const rawContentType =
      rawObject.httpMetadata?.contentType ?? inferContentTypeFromKey(rawObjectKey)
    const rawFormat = inferInputFormat(rawContentType, rawObjectKey, rawBody)

    // Transform requests should prefer the normalized working object because the
    // worker cannot safely decode large originals on demand. Fall back to `.raw`
    // only when the working copy is missing and the original is directly
    // transformable.
    if (rawFormat !== 'unknown') {
      return {
        body: rawBody,
        contentType: rawContentType,
        objectKey: rawObjectKey,
        stage,
        version,
      }
    }
  }

  return null
}

const resolveRawDownloadAsset = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<SourceAsset | null> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined

    for (const objectKey of [`${lookup.publicId}.raw`, lookup.publicId]) {
      const object = await bucket.get(objectKey)
      if (!object) {
        continue
      }

      return {
        body: await object.arrayBuffer(),
        contentType:
          object.httpMetadata?.contentType ?? inferContentTypeFromKey(objectKey),
        objectKey,
        stage,
        version,
      }
    }
  }

  return null
}

/**
 * Resolves a metadata document from readable stages, preferring versioned sidecars.
 *
 * @param env Worker bindings.
 * @param requestedStage Requested environment.
 * @param lookup Public id and optional version.
 * @returns Metadata document, stage, and resolved version.
 */
const resolveMetadataDocument = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<{
  document: ImageMetadataDocument | null
  stage: ImageStage
  version?: number
}> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined
    const versioned = version
      ? await bucket.get(toMetadataObjectKey(lookup.publicId, version))
      : null
    const fallback =
      versioned ?? (await bucket.get(toMetadataObjectKey(lookup.publicId)))

    if (!fallback) {
      continue
    }

    return {
      document: (await fallback.json()) as ImageMetadataDocument,
      stage,
      version,
    }
  }

  return { document: null, stage: requestedStage, version: lookup.version }
}

/**
 * Executes the decode, crop, resize, and encode pipeline for a source image.
 *
 * @param source Source object bytes and metadata.
 * @param request Parsed transform request with resolved output format.
 * @returns Encoded derived image.
 */
const transformSourceAsset = async (
  source: SourceAsset,
  request: TransformRequest & { format: OutputFormat },
  debug: TransformDebugContext,
): Promise<{ body: ArrayBuffer; contentType: string }> => {
  await ensureResizeReady()

  if (source.contentType === 'image/svg+xml') {
    if (request.format !== 'svg') {
      return {
        body: source.body,
        contentType: 'image/svg+xml',
      }
    }

    return {
      body: source.body,
      contentType: 'image/svg+xml',
    }
  }

  const transformed = await decodeAndTransformSourceAsset(source, request, debug)
  logTransformDebug(debug, 'transformed', {
    transformedWidth: transformed.image.width,
    transformedHeight: transformed.image.height,
    transformedBytes: toImageDataBytes(transformed.image),
    transformedMegapixels: toMegapixels(transformed.image),
  })
  const encoded = await encodeOutput(
    transformed.image,
    request.format,
    request.quality,
    transformed.hasAlpha,
  )
  logTransformDebug(debug, 'encoded', {
    codecPath: `${transformed.inputFormat}->${request.format}`,
    outputFormat: request.format,
    encodedBytes: encoded.body.byteLength,
    estimatedLivePixelBytes: transformed.estimatedPeakPixelBytes,
  })

  return {
    body: encoded.body,
    contentType: encoded.contentType,
  }
}

/**
 * Decodes the source and runs the resize pipeline in a tighter scope so large
 * intermediate buffers can fall out of reach before the encode stage begins.
 *
 * @param source Source object bytes and metadata.
 * @param request Parsed transform request.
 * @param debug Debug logging context.
 * @returns Final transformed pixels plus lightweight decode metadata.
 */
const decodeAndTransformSourceAsset = async (
  source: SourceAsset,
  request: TransformRequest & { format: OutputFormat },
  debug: TransformDebugContext,
): Promise<
  TransformPipelineResult & Pick<DecodedImage, 'hasAlpha' | 'inputFormat'>
> => {
  const decoded = await decodeSourceImage(source)
  const decodedBytes = toImageDataBytes(decoded.data)

  logTransformDebug(debug, 'decoded', {
    inputFormat: decoded.inputFormat,
    decodedWidth: decoded.data.width,
    decodedHeight: decoded.data.height,
    decodedBytes,
    decodedMegapixels: toMegapixels(decoded.data),
    hasAlpha: decoded.hasAlpha,
  })

  const transformed = await applyTransforms(decoded.data, request, debug)

  return {
    image: transformed.image,
    estimatedPeakPixelBytes: Math.max(
      transformed.estimatedPeakPixelBytes,
      decodedBytes + toImageDataBytes(transformed.image),
    ),
    hasAlpha: decoded.hasAlpha,
    inputFormat: decoded.inputFormat,
  }
}

/**
 * Decodes a raster source image into RGBA pixel data.
 *
 * @param source Source object bytes and content type.
 * @returns Decoded image and alpha metadata.
 */
const decodeSourceImage = async (source: SourceAsset): Promise<DecodedImage> => {
  const format = inferInputFormat(source.contentType, source.objectKey, source.body)
  const buffer = source.body
  let data: ImageData

  if (format === 'png') {
    await ensurePngDecodeReady()
    data = await decodePng(buffer)
  } else if (format === 'webp') {
    await ensureWebpDecodeReady()
    data = await decodeWebp(buffer)
  } else if (format === 'avif') {
    await ensureAvifDecodeReady()
    data = await decodeAvif(buffer)
  } else if (format === 'jxl') {
    await ensureJxlDecodeReady()
    data = await decodeJxl(buffer)
  } else {
    await ensureJpegDecodeReady()
    data = await decodeJpeg(buffer, { preserveOrientation: true })
  }

  return {
    data,
    hasAlpha: imageDataHasAlpha(data),
    inputFormat: format,
  }
}

/**
 * Applies crop and resize semantics for the supported Cloudinary-compatible modes.
 *
 * @param image Input image pixels.
 * @param request Parsed transform request.
 * @returns Transformed image pixels.
 */
const applyTransforms = async (
  image: ImageData,
  request: TransformRequest,
  debug?: TransformDebugContext,
): Promise<TransformPipelineResult> => {
  const target = resolveTargetDimensions(image, request)
  if (!target) {
    return {
      image,
      estimatedPeakPixelBytes: toImageDataBytes(image),
    }
  }

  const workingImage = await maybeDownscaleForLowMemoryPath(
    image,
    target,
    request,
    debug,
  )
  const workingBytes = toImageDataBytes(workingImage)

  if (request.cropMode === 'c_fit') {
    if (debug) {
      logTransformDebug(debug, 'resize-start', {
        resizeStage: 'fit',
        sourceWidth: workingImage.width,
        sourceHeight: workingImage.height,
        targetWidth: target.width,
        targetHeight: target.height,
        sourceMegapixels: toMegapixels(workingImage),
      })
    }

    let transformed: ImageData

    try {
      transformed = await resize(workingImage, {
        width: target.width,
        height: target.height,
        method: 'lanczos3',
      })
    } catch (error) {
      if (debug) {
        logTransformDebug(debug, 'resize-failed', {
          resizeStage: 'fit',
          sourceWidth: workingImage.width,
          sourceHeight: workingImage.height,
          targetWidth: target.width,
          targetHeight: target.height,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      throw new AssetTransformStageError('resize-fit', {
        error: error instanceof Error ? error.message : String(error),
        resizeStage: 'fit',
        sourceWidth: workingImage.width,
        sourceHeight: workingImage.height,
        targetWidth: target.width,
        targetHeight: target.height,
      })
    }

    return {
      image: transformed,
      estimatedPeakPixelBytes: workingBytes + toImageDataBytes(transformed),
    }
  }

  const crop = await resolveCropRect(workingImage, target, request.gravity, debug)
  const cropped = cropImageData(workingImage, crop.x, crop.y, crop.width, crop.height)
  const croppedBytes = toImageDataBytes(cropped)
  if (debug) {
    logTransformDebug(debug, 'cropped', {
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height,
      croppedBytes,
      croppedMegapixels: toMegapixels(cropped),
      estimatedLivePixelBytes: workingBytes + croppedBytes,
    })
  }

  if (debug) {
    logTransformDebug(debug, 'resize-start', {
      resizeStage: 'post-crop',
      sourceWidth: cropped.width,
      sourceHeight: cropped.height,
      targetWidth: target.width,
      targetHeight: target.height,
      sourceMegapixels: toMegapixels(cropped),
    })
  }

  let transformed: ImageData

  try {
    transformed = await resize(cropped, {
      width: target.width,
      height: target.height,
      method: 'lanczos3',
    })
  } catch (error) {
    if (debug) {
      logTransformDebug(debug, 'resize-failed', {
        resizeStage: 'post-crop',
        sourceWidth: cropped.width,
        sourceHeight: cropped.height,
        targetWidth: target.width,
        targetHeight: target.height,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    throw new AssetTransformStageError('resize-post-crop', {
      error: error instanceof Error ? error.message : String(error),
      resizeStage: 'post-crop',
      sourceWidth: cropped.width,
      sourceHeight: cropped.height,
      targetWidth: target.width,
      targetHeight: target.height,
    })
  }

  return {
    image: transformed,
    estimatedPeakPixelBytes: Math.max(
      workingBytes + croppedBytes,
      croppedBytes + toImageDataBytes(transformed),
    ),
  }
}

const maybeDownscaleForLowMemoryPath = async (
  image: ImageData,
  target: { width: number; height: number },
  request: TransformRequest,
  debug?: TransformDebugContext,
): Promise<ImageData> => {
  const shouldUseLowMemoryPath = toPixelCount(image) > MAX_LOW_MEMORY_SOURCE_PIXELS

  if (!shouldUseLowMemoryPath) {
    return image
  }

  const currentMaxDimension = Math.max(image.width, image.height)
  const intermediateMaxDimension = clamp(
    Math.max(target.width, target.height) * 4,
    LOW_MEMORY_MIN_INTERMEDIATE_DIMENSION,
    LOW_MEMORY_MAX_INTERMEDIATE_DIMENSION,
  )
  const ratio = Math.min(1, intermediateMaxDimension / currentMaxDimension)
  const downscaleWidth = Math.max(1, Math.round(image.width * ratio))
  const downscaleHeight = Math.max(1, Math.round(image.height * ratio))

  if (debug) {
    logTransformDebug(debug, 'low-memory-downscale-start', {
      originalWidth: image.width,
      originalHeight: image.height,
      originalMegapixels: toMegapixels(image),
      intermediateMaxDimension,
      targetWidth: downscaleWidth,
      targetHeight: downscaleHeight,
      targetMegapixels: Number(
        ((downscaleWidth * downscaleHeight) / 1_000_000).toFixed(2),
      ),
    })
  }

  let downscaled = image

  try {
    while (
      downscaled.width > downscaleWidth * 2 ||
      downscaled.height > downscaleHeight * 2
    ) {
      const nextWidth = Math.max(downscaleWidth, Math.round(downscaled.width / 2))
      const nextHeight = Math.max(downscaleHeight, Math.round(downscaled.height / 2))

      if (debug) {
        logTransformDebug(debug, 'low-memory-downscale-step', {
          sourceWidth: downscaled.width,
          sourceHeight: downscaled.height,
          nextWidth,
          nextHeight,
          sourceMegapixels: toMegapixels(downscaled),
        })
      }

      downscaled = await resize(downscaled, {
        width: nextWidth,
        height: nextHeight,
        method: 'triangle',
      })
    }

    downscaled = await resize(downscaled, {
      width: downscaleWidth,
      height: downscaleHeight,
      method: 'triangle',
    })
  } catch (error) {
    if (debug) {
      logTransformDebug(debug, 'low-memory-downscale-failed', {
        originalWidth: image.width,
        originalHeight: image.height,
        originalMegapixels: toMegapixels(image),
        intermediateMaxDimension,
        targetWidth: downscaleWidth,
        targetHeight: downscaleHeight,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (
      Math.max(image.width, image.height) <= LOW_MEMORY_FALLBACK_MAX_SOURCE_DIMENSION
    ) {
      if (debug) {
        logTransformDebug(debug, 'low-memory-downscale-fallback', {
          fallback: 'use-original-working-image',
          originalWidth: image.width,
          originalHeight: image.height,
          originalMegapixels: toMegapixels(image),
          maxSourceDimension: LOW_MEMORY_FALLBACK_MAX_SOURCE_DIMENSION,
        })
      }

      return image
    }

    throw new AssetTransformStageError('low-memory-downscale', {
      error: error instanceof Error ? error.message : String(error),
      originalWidth: image.width,
      originalHeight: image.height,
      originalMegapixels: toMegapixels(image),
      intermediateMaxDimension,
      targetWidth: downscaleWidth,
      targetHeight: downscaleHeight,
    })
  }

  if (debug) {
    logTransformDebug(debug, 'low-memory-downscale', {
      originalWidth: image.width,
      originalHeight: image.height,
      originalMegapixels: toMegapixels(image),
      downscaledWidth: downscaled.width,
      downscaledHeight: downscaled.height,
      downscaledMegapixels: toMegapixels(downscaled),
      downscaledBytes: toImageDataBytes(downscaled),
    })
  }

  return downscaled
}

/**
 * Resolves the best crop rectangle for fill/thumb behavior.
 *
 * @param image Source image data.
 * @param target Target output dimensions.
 * @param gravity Gravity mode.
 * @returns Crop rectangle in source pixel coordinates.
 */
const resolveCropRect = async (
  image: ImageData,
  target: { width: number; height: number },
  gravity: GravityMode,
  debug?: TransformDebugContext,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const imageRatio = image.width / image.height
  const targetRatio = target.width / target.height
  const cropWidth =
    imageRatio > targetRatio ? Math.round(image.height * targetRatio) : image.width
  const cropHeight =
    imageRatio > targetRatio ? image.height : Math.round(image.width / targetRatio)

  if (gravity === 'g_center') {
    return {
      x: Math.max(0, Math.round((image.width - cropWidth) / 2)),
      y: Math.max(0, Math.round((image.height - cropHeight) / 2)),
      width: cropWidth,
      height: cropHeight,
    }
  }

  if (toPixelCount(image) > MAX_SMARTCROP_SOURCE_PIXELS) {
    if (debug) {
      logTransformDebug(debug, 'smartcrop-skipped', {
        reason: 'source-too-large',
        sourceMegapixels: toMegapixels(image),
        maxSmartcropPixels: MAX_SMARTCROP_SOURCE_PIXELS,
      })
    }

    return {
      x: Math.max(0, Math.round((image.width - cropWidth) / 2)),
      y: Math.max(0, Math.round((image.height - cropHeight) / 2)),
      width: cropWidth,
      height: cropHeight,
    }
  }

  try {
    const result = (await smartcrop.crop(
      {
        width: image.width,
        height: image.height,
        data: image.data,
      } as unknown as CanvasImageSource,
      {
        width: cropWidth,
        height: cropHeight,
        imageOperations: createSmartCropOperations(),
      },
    )) as SmartCropResult

    if (result.topCrop) {
      return {
        x: clampInt(result.topCrop.x, 0, image.width - cropWidth),
        y: clampInt(result.topCrop.y, 0, image.height - cropHeight),
        width: cropWidth,
        height: cropHeight,
      }
    }
  } catch (error) {
    console.warn('smartcrop failed; falling back to center crop', { error })
  }

  return {
    x: Math.max(0, Math.round((image.width - cropWidth) / 2)),
    y: Math.max(0, Math.round((image.height - cropHeight) / 2)),
    width: cropWidth,
    height: cropHeight,
  }
}

/**
 * Encodes transformed pixels to the requested delivery format.
 *
 * @param image Image pixels to encode.
 * @param format Output format.
 * @param quality Raw quality token from the request.
 * @param hasAlpha Whether the input pixels contain transparency.
 * @returns Encoded output bytes and content type.
 */
const encodeOutput = async (
  image: ImageData,
  format: OutputFormat,
  quality: string,
  hasAlpha: boolean,
): Promise<{ body: ArrayBuffer; contentType: string }> => {
  if (format === 'svg') {
    throw new Error('SVG output is only supported as a passthrough for SVG sources')
  }

  if (format === 'png') {
    await ensurePngEncodeReady()
    const body = await encodePng(image)
    return {
      body,
      contentType: 'image/png',
    }
  }

  if (format === 'webp') {
    await ensureWebpEncodeReady()
    const body = await encodeWebp(image, { quality: resolveQuality(quality, 'webp') })
    return {
      body,
      contentType: 'image/webp',
    }
  }

  if (format === 'avif') {
    await ensureAvifEncodeReady()
    const body = await encodeAvif(image, { quality: resolveQuality(quality, 'avif') })
    return {
      body,
      contentType: 'image/avif',
    }
  }

  if (format === 'jxl') {
    await ensureJxlEncodeReady()
    const body = await encodeJxl(image, { quality: resolveQuality(quality, 'jxl') })
    return {
      body,
      contentType: 'image/jxl',
    }
  }

  await ensureJpegEncodeReady()

  const body = await encodeJpeg(hasAlpha ? flattenAlpha(image) : image, {
    quality: resolveQuality(quality, 'jpeg'),
  })

  return {
    body,
    contentType: 'image/jpeg',
  }
}

/**
 * Creates a smartcrop image-operations adapter backed by jSquash resize rather than canvas.
 *
 * @returns Adapter object compatible with smartcrop.
 */
const createSmartCropOperations = (): {
  open(image: SmartCropImage): Promise<SmartCropImage>
  resample(
    image: SmartCropImage,
    width: number,
    height: number,
  ): Promise<SmartCropImage>
  getData(
    image: SmartCropImage,
  ): Promise<{ width: number; height: number; data: Uint8ClampedArray }>
} => ({
  async open(image: SmartCropImage): Promise<SmartCropImage> {
    return image
  },

  async resample(
    image: SmartCropImage,
    width: number,
    height: number,
  ): Promise<SmartCropImage> {
    const resized = await resize(new ImageData(image.data, image.width, image.height), {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      method: 'triangle',
    })

    return {
      width: resized.width,
      height: resized.height,
      data: resized.data,
    }
  },

  async getData(image: SmartCropImage): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
  }> {
    return image
  },
})

/**
 * Crops a source image in-memory by copying rows into a new pixel buffer.
 *
 * @param image Source image data.
 * @param x Left crop origin.
 * @param y Top crop origin.
 * @param width Crop width.
 * @param height Crop height.
 * @returns Cropped image data.
 */
const cropImageData = (
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageData => {
  const output = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * image.width + x) * 4
    const sourceEnd = sourceStart + width * 4
    const targetStart = row * width * 4
    output.set(image.data.subarray(sourceStart, sourceEnd), targetStart)
  }

  return new ImageData(output, width, height)
}

/**
 * Resolves output dimensions for fit/fill requests while keeping aspect ratio intact.
 *
 * @param image Input image data.
 * @param request Parsed transform request.
 * @returns Target dimensions or null when no resize was requested.
 */
const resolveTargetDimensions = (
  image: ImageData,
  request: TransformRequest,
): { width: number; height: number } | null => {
  const requestedWidth = request.width
  const requestedHeight = request.height

  if (!requestedWidth && !requestedHeight) {
    return null
  }

  if (request.cropMode === 'c_fill' || request.cropMode === 'c_thumb') {
    return {
      width: requestedWidth ?? requestedHeight ?? image.width,
      height: requestedHeight ?? requestedWidth ?? image.height,
    }
  }

  const widthRatio = requestedWidth
    ? requestedWidth / image.width
    : Number.POSITIVE_INFINITY
  const heightRatio = requestedHeight
    ? requestedHeight / image.height
    : Number.POSITIVE_INFINITY
  const ratio = Math.min(widthRatio, heightRatio)

  if (!Number.isFinite(ratio)) {
    if (requestedWidth) {
      return {
        width: requestedWidth,
        height: Math.max(1, Math.round((image.height * requestedWidth) / image.width)),
      }
    }

    return {
      width: Math.max(
        1,
        Math.round((image.width * (requestedHeight ?? image.height)) / image.height),
      ),
      height: requestedHeight ?? image.height,
    }
  }

  return {
    width: Math.max(1, Math.round(image.width * ratio)),
    height: Math.max(1, Math.round(image.height * ratio)),
  }
}

/**
 * Chooses a delivery format from the request and client `Accept` preferences.
 *
 * @param request Original request.
 * @param sourceContentType Source object content type.
 * @param requestedFormat Explicit requested format or `auto`.
 * @returns Output format.
 */
const chooseOutputFormat = (
  request: Request,
  sourceContentType: string,
  requestedFormat: 'auto' | OutputFormat,
): OutputFormat => {
  if (requestedFormat !== 'auto') {
    return requestedFormat
  }

  if (sourceContentType === 'image/svg+xml') {
    return 'svg'
  }

  const accept = request.headers.get('accept') ?? ''
  return chooseAutoOutputFormat(accept)
}

/**
 * Converts an R2 object body into a response with cache and provenance headers.
 *
 * @param object Existing R2 object body.
 * @param options Response metadata.
 * @returns HTTP response.
 */
const toObjectResponse = (
  object: R2ObjectBody,
  options: {
    method: string
    stage: ImageStage
    version?: number
    canonicalKey: string
  },
): Response =>
  new Response(options.method === 'HEAD' ? null : object.body, {
    headers: {
      'cache-control': object.httpMetadata?.cacheControl ?? CACHE_CONTROL_IMMUTABLE,
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: object.httpEtag,
      vary: 'Accept',
      'x-image-source-env': options.stage,
      'x-image-transform-key': options.canonicalKey,
      ...(options.version ? { 'x-image-version': String(options.version) } : {}),
    },
  })

const toEdgeCacheKey = (request: Request): Request =>
  new Request(request.url, {
    method: 'GET',
    headers: {
      Accept: request.headers.get('Accept') ?? '*/*',
    },
  })

const toHeadAwareResponse = (response: Response, method: string): Response =>
  method === 'HEAD'
    ? new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response

/**
 * Maps metadata profiles onto the subset returned to callers.
 *
 * @param document Metadata sidecar document.
 * @param profile Requested metadata profile.
 * @returns Profile payload.
 */
const toMetadataProfilePayload = (
  document: ImageMetadataDocument,
  profile: MetadataProfile,
): ImageMetadataDocument => {
  if (profile === 'full' || profile === 'admin' || profile === 'auto') {
    return document
  }

  return {
    originalFilename: document.originalFilename ?? null,
    originalExtension: document.originalExtension ?? null,
    originalWidth: document.originalWidth ?? null,
    originalHeight: document.originalHeight ?? null,
    cameraModel: document.cameraModel ?? null,
    capturedAt: document.capturedAt ?? null,
    credit: document.credit ?? null,
    latitude: document.latitude ?? null,
    longitude: document.longitude ?? null,
  }
}

/**
 * Builds the stable derived-cache key for a transformed asset.
 *
 * @param request Parsed request with normalized options.
 * @returns Canonical transform key.
 */
const toCanonicalTransformKey = (
  request: TransformRequest & { format: OutputFormat },
): string => {
  const parts = [
    request.cropMode,
    request.width ? `w_${request.width}` : null,
    request.height ? `h_${request.height}` : null,
    request.gravity,
    request.quality,
    `f_${request.format}`,
  ].filter(Boolean)

  return parts.join(',')
}

/**
 * Creates the derived object path inside the derived-cache bucket.
 *
 * @param params Derived object parameters.
 * @returns Derived bucket object key.
 */
const toDerivedObjectKey = (params: {
  publicId: string
  version?: number
  canonicalKey: string
}): string =>
  `${params.publicId}/${params.version ? `v${params.version}` : 'latest'}/${params.canonicalKey}`

/**
 * Creates the metadata sidecar key next to the original object.
 *
 * @param publicId Canonical public id.
 * @param version Optional version.
 * @returns Metadata object key.
 */
const toMetadataObjectKey = (publicId: string, version?: number): string =>
  version
    ? `${publicId}.v${version}${METADATA_SUFFIX}`
    : `${publicId}${METADATA_SUFFIX}`

/**
 * Creates the manifest sidecar key used to resolve the latest version.
 *
 * @param publicId Canonical public id.
 * @returns Manifest object key.
 */
const toManifestObjectKey = (publicId: string): string =>
  `${publicId}${MANIFEST_SUFFIX}`

/**
 * Reads the manifest version for a public id.
 *
 * @param bucket Originals bucket to inspect.
 * @param publicId Public id.
 * @returns Manifest version or null.
 */
const readManifestVersion = async (
  bucket: R2Bucket,
  publicId: string,
): Promise<number | null> => {
  const manifest = await bucket.get(toManifestObjectKey(publicId))
  if (!manifest) {
    return null
  }

  const json = (await manifest.json()) as { version?: number }
  return typeof json.version === 'number' ? json.version : null
}

/**
 * Returns the originals bucket binding for a stage.
 *
 * @param env Worker bindings.
 * @param stage Logical image stage.
 * @returns R2 originals bucket.
 */
const getOriginalsBucket = (env: Env, stage: ImageStage): R2Bucket => {
  if (stage === 'production') return env.ASSET_RAW_PRODUCTION
  if (stage === 'preview') return env.ASSET_RAW_PREVIEW
  return env.ASSET_RAW_DEV
}

/**
 * Returns the derived bucket binding for a stage.
 *
 * @param env Worker bindings.
 * @param stage Logical image stage.
 * @returns R2 derived bucket.
 */
const getDerivedBucket = (env: Env, stage: ImageStage): R2Bucket => {
  if (stage === 'production') return env.ASSET_PUBLIC_PRODUCTION
  if (stage === 'preview') return env.ASSET_PUBLIC_PREVIEW
  return env.ASSET_PUBLIC_DEV
}

/**
 * Returns the readable source stages for a given request stage.
 *
 * @param requestedStage Requested stage.
 * @returns Ordered readable stages.
 */
const getReadableStages = (requestedStage: ImageStage): ImageStage[] => {
  if (requestedStage === 'local') return ['local', 'preview', 'production']
  if (requestedStage === 'preview') return ['preview', 'production']
  return ['production']
}

/**
 * Resolves the logical stage for a request from host/runtime rather than URL path.
 *
 * @param url Incoming request URL.
 * @param env Worker bindings.
 * @returns Requested image stage.
 */
const resolveRequestedStageFromRequest = (url: URL, env: Env): ImageStage => {
  if (url.hostname === 'assets.hype.hk') {
    return 'production'
  }

  if (url.hostname === 'raw.assets.preview.hype.hk') {
    return 'preview'
  }

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return env.ENVIRONMENT
  }

  return env.ENVIRONMENT
}

/**
 * Coerces a URL env segment into the supported stage enum.
 *
 * @param value URL segment.
 * @returns Normalized stage.
 */
const toStage = (value: string): ImageStage =>
  value === 'preview' || value === 'production' ? value : 'local'

/**
 * Identifies whether a path segment is a recognized modifier segment.
 *
 * @param segment Path segment.
 * @returns Whether the segment contains transform modifiers.
 */
const looksLikeModifierSegment = (segment: string): boolean =>
  ['c_', 'g_', 'f_', 'q_', 'e_', 'w_', 'h_'].some(prefix => segment.startsWith(prefix))

/**
 * Normalizes supported crop mode aliases.
 *
 * @param value Crop token.
 * @returns Supported crop mode.
 */
const toCropMode = (value: string): CropMode =>
  value === 'c_fill' || value === 'c_thumb' ? value : 'c_fit'

/**
 * Normalizes supported gravity tokens.
 *
 * @param value Gravity token.
 * @returns Supported gravity.
 */
const toGravityMode = (value: string): GravityMode =>
  value === 'g_center' ? 'g_center' : 'g_auto'

/**
 * Maps format tokens onto supported output formats.
 *
 * @param value Format token.
 * @returns Explicit output format or `auto`.
 */
const toExplicitFormat = (value: string): 'auto' | OutputFormat => {
  if (value === 'f_auto') return 'auto'
  if (value === 'f_avif') return 'avif'
  if (value === 'f_jxl') return 'jxl'
  if (value === 'f_png') return 'png'
  if (value === 'f_svg') return 'svg'
  if (value === 'f_webp') return 'webp'
  return 'jpeg'
}

/**
 * Normalizes metadata profile aliases.
 *
 * @param value Metadata profile token.
 * @returns Supported metadata profile.
 */
const toMetadataProfile = (value: string): MetadataProfile => {
  if (value === 'p_basic') return 'basic'
  if (value === 'p_full' || value === 'p_admin' || value === 'p_auto') return 'full'
  return 'full'
}

/**
 * Normalizes metadata format aliases.
 *
 * @param value Metadata format token.
 * @returns Supported metadata format.
 */
const toMetadataFormat = (_value: string): 'json' => 'json'

/**
 * Extracts a known output format from a public id extension.
 *
 * @param publicId Public id or filename.
 * @returns Format or null.
 */
const extractExtension = (publicId: string): OutputFormat | null => {
  const extension = publicId.split('.').pop()?.toLowerCase()
  if (!extension) return null
  if (extension === 'avif') return 'avif'
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'jxl') return 'jxl'
  if (extension === 'png') return 'png'
  if (extension === 'svg') return 'svg'
  if (extension === 'webp') return 'webp'
  return null
}

/**
 * Removes a known image extension from a public id.
 *
 * @param publicId Public id.
 * @returns Extensionless public id.
 */
const stripKnownExtension = (publicId: string): string =>
  publicId.replace(/\.(avif|jpe?g|jxl|png|svg|webp)$/i, '')

/**
 * Infers a source image format from object metadata and fallback key hints.
 *
 * @param contentType Source content type.
 * @param objectKey Source object key.
 * @returns Input format.
 */
const inferInputFormat = (
  contentType: string,
  objectKey: string,
  body?: ArrayBuffer,
): OutputFormat | 'unknown' => {
  if (contentType === 'image/avif') return 'avif'
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpeg'
  if (contentType === 'image/jxl') return 'jxl'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/svg+xml') return 'svg'
  if (contentType === 'image/webp') return 'webp'

  const extensionFormat = extractExtension(objectKey)
  if (extensionFormat) {
    return extensionFormat
  }

  return body ? sniffInputFormat(body) : 'unknown'
}

/**
 * Sniffs common raster signatures when object metadata does not preserve the source type.
 *
 * @param body Source bytes.
 * @returns Best-effort input format.
 */
const sniffInputFormat = (body: ArrayBuffer): OutputFormat | 'unknown' => {
  const bytes = new Uint8Array(body)

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0,
    )
    if (brand === 'avif' || brand === 'avis') {
      return 'avif'
    }
    if (brand === 'jxl ' || brand === 'jxs ') {
      return 'jxl'
    }
  }

  if (
    (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a) ||
    (bytes.length >= 12 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x0c &&
      bytes[4] === 0x4a &&
      bytes[5] === 0x58 &&
      bytes[6] === 0x4c &&
      bytes[7] === 0x20 &&
      bytes[8] === 0x0d &&
      bytes[9] === 0x0a &&
      bytes[10] === 0x87 &&
      bytes[11] === 0x0a)
  ) {
    return 'jxl'
  }

  return 'unknown'
}

/**
 * Infers a content type from an object key when R2 metadata is missing.
 *
 * @param objectKey Object key.
 * @returns Best-effort content type.
 */
const inferContentTypeFromKey = (objectKey: string): string => {
  if (objectKey.endsWith('.raw')) return 'image/tiff'
  const extension = extractExtension(objectKey)
  if (extension === 'avif') return 'image/avif'
  if (extension === 'jpeg') return 'image/jpeg'
  if (extension === 'jxl') return 'image/jxl'
  if (extension === 'png') return 'image/png'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

const extensionFromContentType = (contentType: string): string => {
  if (contentType === 'image/avif') return 'avif'
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg'
  if (contentType === 'image/jxl') return 'jxl'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/svg+xml') return 'svg'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/tiff') return 'tiff'
  return 'bin'
}

const stripExtensionFromFilename = (filename: string): string =>
  filename.replace(/\.[^.]+$/u, '')

const sanitizeDownloadFilename = (filename: string): string =>
  filename.replace(/[/\\?%*:|"<>]/gu, '-').trim() || 'image'

const toRawDownloadFilename = (
  publicId: string,
  objectKey: string,
  contentType: string,
  metadata: ImageMetadataDocument | null,
): string => {
  const extension = extensionFromContentType(contentType)
  const originalFilename = metadata?.originalFilename?.trim()

  if (originalFilename) {
    return `${sanitizeDownloadFilename(stripExtensionFromFilename(originalFilename))}.${extension}`
  }

  const fallbackBase = objectKey.endsWith('.raw')
    ? objectKey.slice(0, -'.raw'.length).split('/').at(-1)
    : publicId.split('/').at(-1)

  return `${sanitizeDownloadFilename(fallbackBase ?? 'image')}.${extension}`
}

/**
 * Resolves an encoder quality from a raw request token.
 *
 * @param rawQuality Raw `q_*` token.
 * @param format Output format.
 * @returns Numeric encoder quality.
 */
const resolveQuality = (
  rawQuality: string,
  format: keyof typeof QUALITY_BY_FORMAT,
): number => {
  if (rawQuality.startsWith('q_') && isIntegerString(rawQuality.slice(2))) {
    return clampInt(Number(rawQuality.slice(2)), 1, 100)
  }
  return QUALITY_BY_FORMAT[format]
}

/**
 * Detects whether an RGBA image contains any transparency.
 *
 * @param image Image data.
 * @returns Whether any pixel alpha is below 255.
 */
const imageDataHasAlpha = (image: ImageData): boolean => {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] < 255) {
      return true
    }
  }
  return false
}

/**
 * Flattens transparency onto a white background for JPEG output.
 *
 * @param image Source image data.
 * @returns Opaque image data.
 */
const flattenAlpha = (image: ImageData): ImageData => {
  const output = new Uint8ClampedArray(image.data.length)

  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3] / 255
    output[index] = Math.round(image.data[index] * alpha + 255 * (1 - alpha))
    output[index + 1] = Math.round(image.data[index + 1] * alpha + 255 * (1 - alpha))
    output[index + 2] = Math.round(image.data[index + 2] * alpha + 255 * (1 - alpha))
    output[index + 3] = 255
  }

  return new ImageData(output, image.width, image.height)
}

/**
 * Clamps a user-provided dimension token to the supported transform range.
 *
 * @param value Raw dimension token.
 * @returns Clamped dimension or undefined.
 */
const clampDimension = (value: string): number | undefined => {
  if (!isIntegerString(value)) {
    return undefined
  }

  return clampInt(Number(value), 1, MAX_TRANSFORM_DIMENSION)
}

/**
 * Clamps a numeric value to an inclusive range.
 *
 * @param value Input number.
 * @param min Minimum allowed value.
 * @param max Maximum allowed value.
 * @returns Clamped integer.
 */
const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

/**
 * Checks whether a string contains only base-10 digits.
 *
 * @param value Candidate string.
 * @returns Whether the string is an integer representation.
 */
const isIntegerString = (value: string): boolean => /^\d+$/.test(value)

export default {
  fetch: handleFetch,
  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    for (const message of batch.messages) {
      if (!isImageWarmupJob(message.body)) {
        console.error('Discarding invalid image warmup job payload.')
        message.ack()
        continue
      }

      try {
        const result = await processImageWarmupJob(env, ctx, message.body)

        if (result.retry) {
          message.retry()
          continue
        }

        message.ack()
      } catch (error) {
        console.error('Image warmup job failed', {
          error,
          job: message.body,
        })
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env>
