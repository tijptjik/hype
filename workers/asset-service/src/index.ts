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

type ImageStage = 'local' | 'preview' | 'production'
type CropMode = 'c_fill' | 'c_fit' | 'c_thumb'
type GravityMode = 'g_auto' | 'g_center'
type OutputFormat = 'avif' | 'jpeg' | 'jxl' | 'png' | 'svg' | 'webp'
type MetadataProfile = 'admin' | 'auto' | 'basic' | 'full'
type ImageCacheStatus = 'edge-hit' | 'r2-derived-hit' | 'transform-miss'
type AnalyticsWindowKey = '24h' | '7d' | '30d'

type Env = {
  ENVIRONMENT: ImageStage
  RAW_ASSET_BASE_URL: string
  ASSET_ANALYTICS: AnalyticsEngineDataset
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
}

type AnalyticsP95Row = {
  cache_status: ImageCacheStatus | null
  p95_total_ms: number | string | null
  request_count: number | string
}

type AnalyticsWindowSummary = {
  cacheHitPercent: number
  derivedHitPercent: number
  derivedMissPercent: number
  p95Ms: {
    cache: number | null
    derivedHit: number | null
    derivedMiss: number | null
  }
  topImages: Array<{ publicId: string; requests: number }>
  topTransformations: Array<{ requests: number; transformKey: string }>
  totalRequests: number
}

type AnalyticsSummaryResponse = {
  environment: ImageStage
  generatedAt: string
  windows: Record<AnalyticsWindowKey, AnalyticsWindowSummary>
}

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_CONTROL_SHORT = 'public, max-age=300'
const ASSET_ANALYTICS_DATASET = 'hype_asset_delivery'
const ASSET_ANALYTICS_WINDOWS: Record<AnalyticsWindowKey, string> = {
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
const QUALITY_BY_FORMAT = {
  avif: 45,
  jpeg: 80,
  jxl: 75,
  webp: 75,
} as const

let activeTransformCount = 0

const ensureResizeReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = initResize(squooshResizeWasm).then(() => undefined)
    }

    return ready
  }
})()

const ensureJpegReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = Promise.all([
        initJpegDecode(jpegDecodeWasm),
        initJpegEncode(jpegEncodeWasm),
      ]).then(() => undefined)
    }

    return ready
  }
})()

const ensurePngReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = Promise.all([initPngDecode(pngWasm), initPngEncode(pngWasm)]).then(
        () => undefined,
      )
    }

    return ready
  }
})()

const ensureWebpReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = Promise.all([
        initWebpDecode(webpDecodeWasm),
        simd().then(isSimd =>
          initWebpEncode(isSimd ? webpEncodeSimdWasm : webpEncodeWasm),
        ),
      ]).then(() => undefined)
    }

    return ready
  }
})()

const ensureAvifReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = Promise.all([
        initAvifDecode(avifDecodeWasm),
        initAvifEncode(avifEncodeWasm),
      ]).then(() => undefined)
    }

    return ready
  }
})()

const ensureJxlReady = (() => {
  let ready: Promise<void> | null = null

  return (): Promise<void> => {
    if (!ready) {
      ready = Promise.all([
        initJxlDecode(jxlDecodeWasm),
        initJxlEncode(jxlEncodeWasm),
      ]).then(() => undefined)
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
      rawAssetBaseUrl: env.RAW_ASSET_BASE_URL,
    })
  }

  if (request.method === 'GET' && url.pathname === '/analytics/summary') {
    return handleAnalyticsSummaryRequest(request, env)
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 3) {
    return new Response('Not found', { status: 404 })
  }

  const stage = toStage(segments[0])
  const mediaType = segments[1]
  const serviceType = segments[2]

  if (mediaType !== 'image') {
    return new Response('Not found', { status: 404 })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (serviceType === 'metadata') {
    const parsed = parseMetadataRequest(stage, segments.slice(3))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleMetadataRequest(request, env, parsed.value)
  }

  if (serviceType === 'upload') {
    const parsed = parseTransformRequest(stage, segments.slice(3))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleTransformRequest(request, env, ctx, parsed.value)
  }

  return new Response('Not found', { status: 404 })
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
    const windowEntries = await Promise.all(
      (
        Object.entries(ASSET_ANALYTICS_WINDOWS) as Array<[AnalyticsWindowKey, string]>
      ).map(
        async ([windowKey, intervalExpression]) =>
          [
            windowKey,
            await loadAnalyticsWindowSummary(env, env.ENVIRONMENT, intervalExpression),
          ] as const,
      ),
    )

    const response: AnalyticsSummaryResponse = {
      environment: env.ENVIRONMENT,
      generatedAt: new Date().toISOString(),
      windows: Object.fromEntries(windowEntries) as Record<
        AnalyticsWindowKey,
        AnalyticsWindowSummary
      >,
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
): Promise<AnalyticsWindowSummary> => {
  const [topTransformRows, topImageRows, ratioRows, p95Rows] = await Promise.all([
    queryAnalyticsRows<AnalyticsTopRow>(
      env,
      `
        SELECT
          blob1 AS key,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${toAssetAnalyticsNamespaceClause()}
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
          AND ${toAssetAnalyticsNamespaceClause()}
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
          sumIf(_sample_interval, blob2 = 'transform-miss') AS transform_miss_requests
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${toAssetAnalyticsNamespaceClause()}
        FORMAT JSON
      `,
    ),
    queryAnalyticsRows<AnalyticsP95Row>(
      env,
      `
        SELECT
          blob2 AS cache_status,
          quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_total_ms,
          sum(_sample_interval) AS request_count
        FROM ${ASSET_ANALYTICS_DATASET}
        WHERE timestamp > NOW() - ${intervalExpression}
          AND blob3 = ${toSqlString(environment)}
          AND ${toAssetAnalyticsNamespaceClause()}
        GROUP BY cache_status
        FORMAT JSON
      `,
    ),
  ])

  const ratioRow = ratioRows[0]
  const totalRequests = toSafeNumber(ratioRow?.total_requests)
  const edgeHitRequests = toSafeNumber(ratioRow?.edge_hit_requests)
  const derivedHitRequests = toSafeNumber(ratioRow?.derived_hit_requests)
  const transformMissRequests = toSafeNumber(ratioRow?.transform_miss_requests)

  return {
    cacheHitPercent: toPercent(edgeHitRequests, totalRequests),
    derivedHitPercent: toPercent(derivedHitRequests, totalRequests),
    derivedMissPercent: toPercent(transformMissRequests, totalRequests),
    p95Ms: {
      cache: findP95ForStatus(p95Rows, 'edge-hit'),
      derivedHit: findP95ForStatus(p95Rows, 'r2-derived-hit'),
      derivedMiss: findP95ForStatus(p95Rows, 'transform-miss'),
    },
    topImages: topImageRows
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
 * Writes a delivery event to Analytics Engine without blocking the response path.
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
      event.cacheStatus,
      event.requestedStage,
      event.sourceStage,
      event.outputFormat,
      event.version ? String(event.version) : null,
    ],
    doubles: [event.totalMs, event.contentLength],
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

/**
 * Finds the p95 latency for a specific cache status bucket.
 *
 * @param rows Status-grouped p95 rows.
 * @param status Requested cache status.
 * @returns p95 latency or null.
 */
const findP95ForStatus = (
  rows: AnalyticsP95Row[],
  status: ImageCacheStatus,
): number | null => {
  const row = rows.find(candidate => candidate.cache_status === status)
  if (!row || toSafeNumber(row.request_count) <= 0) {
    return null
  }

  return toSafeNumber(row.p95_total_ms)
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
  const edgeCached = await caches.default.match(cacheKey)
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
    requestedStage: transformRequest.requestedStage,
    publicId: transformRequest.publicId,
    version: resolvedVersion,
    canonicalKey: optimisticCanonical,
  })
  const derivedBucket = getDerivedBucket(env, transformRequest.requestedStage)

  const derivedLookupStartedAt = Date.now()
  const optimisticCached = await derivedBucket.get(optimisticDerivedKey)
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
    return new Response('Asset transform capacity exceeded', {
      status: 503,
      headers: {
        'retry-after': String(TRANSFORM_QUEUE_RETRY_AFTER_SECONDS),
      },
    })
  }

  try {
    // Re-check the cheap derived path after queueing because another request may have filled it.
    const queuedOptimisticCached = await derivedBucket.get(optimisticDerivedKey)
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
      return new Response('Image not found', { status: 404 })
    }

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
    const canonical = toCanonicalTransformKey({
      ...transformRequest,
      format: outputFormat,
      version: resolvedVersion,
    })
    const derivedKey = toDerivedObjectKey({
      requestedStage: transformRequest.requestedStage,
      publicId: transformRequest.publicId,
      version: resolvedVersion,
      canonicalKey: canonical,
    })
    const secondDerivedLookupStartedAt = Date.now()
    const cached = await derivedBucket.get(derivedKey)
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

    const transformStartedAt = Date.now()
    let transformed: { body: ArrayBuffer; contentType: string }

    try {
      transformed = await transformSourceAsset(source, {
        ...transformRequest,
        version: resolvedVersion,
        format: outputFormat,
      })
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'asset-transform-failed',
          requestedStage: transformRequest.requestedStage,
          sourceStage: source.stage,
          publicId: transformRequest.publicId,
          sourceContentType: source.contentType,
          error: error instanceof Error ? error.message : String(error),
        }),
      )

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
 * Emits delivery analytics for successful image GET requests.
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
  if (request.method !== 'GET' || response.status < 200 || response.status >= 300) {
    return
  }

  recordAssetAnalytics(env, {
    ...event,
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
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  if (accept.includes('image/jxl')) return 'jxl'
  if (accept.includes('image/png')) return 'png'
  return 'jpeg'
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

  const decoded = await decodeSourceImage(source)
  const transformed = await applyTransforms(decoded.data, request)
  const encoded = await encodeOutput(
    transformed,
    request.format,
    request.quality,
    decoded.hasAlpha,
  )

  return {
    body: encoded.body,
    contentType: encoded.contentType,
  }
}

/**
 * Decodes a raster source image into RGBA pixel data.
 *
 * @param source Source object bytes and content type.
 * @returns Decoded image and alpha metadata.
 */
const decodeSourceImage = async (source: SourceAsset): Promise<DecodedImage> => {
  const format = inferInputFormat(source.contentType, source.objectKey)
  const buffer = source.body
  let data: ImageData

  if (format === 'png') {
    await ensurePngReady()
    data = await decodePng(buffer)
  } else if (format === 'webp') {
    await ensureWebpReady()
    data = await decodeWebp(buffer)
  } else if (format === 'avif') {
    await ensureAvifReady()
    data = await decodeAvif(buffer)
  } else if (format === 'jxl') {
    await ensureJxlReady()
    data = await decodeJxl(buffer)
  } else {
    await ensureJpegReady()
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
): Promise<ImageData> => {
  const target = resolveTargetDimensions(image, request)
  if (!target) {
    return image
  }

  if (request.cropMode === 'c_fit') {
    return resize(image, {
      width: target.width,
      height: target.height,
      method: 'lanczos3',
    })
  }

  const crop = await resolveCropRect(image, target, request.gravity)
  const cropped = cropImageData(image, crop.x, crop.y, crop.width, crop.height)

  return resize(cropped, {
    width: target.width,
    height: target.height,
    method: 'lanczos3',
  })
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
    await ensurePngReady()
    return {
      body: await encodePng(image),
      contentType: 'image/png',
    }
  }

  if (format === 'webp') {
    await ensureWebpReady()
    return {
      body: await encodeWebp(image, { quality: resolveQuality(quality, 'webp') }),
      contentType: 'image/webp',
    }
  }

  if (format === 'avif') {
    await ensureAvifReady()
    return {
      body: await encodeAvif(image, { quality: resolveQuality(quality, 'avif') }),
      contentType: 'image/avif',
    }
  }

  if (format === 'jxl') {
    await ensureJxlReady()
    return {
      body: await encodeJxl(image, { quality: resolveQuality(quality, 'jxl') }),
      contentType: 'image/jxl',
    }
  }

  await ensureJpegReady()

  return {
    body: await encodeJpeg(hasAlpha ? flattenAlpha(image) : image, {
      quality: resolveQuality(quality, 'jpeg'),
    }),
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
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  if (accept.includes('image/jxl')) return 'jxl'
  if (accept.includes('image/png')) return 'png'
  return 'jpeg'
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
  requestedStage: ImageStage
  publicId: string
  version?: number
  canonicalKey: string
}): string =>
  `${params.requestedStage}/${params.publicId}/${params.version ? `v${params.version}` : 'latest'}/${params.canonicalKey}`

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
): OutputFormat | 'unknown' => {
  if (contentType === 'image/avif') return 'avif'
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpeg'
  if (contentType === 'image/jxl') return 'jxl'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/svg+xml') return 'svg'
  if (contentType === 'image/webp') return 'webp'
  return extractExtension(objectKey) ?? 'unknown'
}

/**
 * Infers a content type from an object key when R2 metadata is missing.
 *
 * @param objectKey Object key.
 * @returns Best-effort content type.
 */
const inferContentTypeFromKey = (objectKey: string): string => {
  const extension = extractExtension(objectKey)
  if (extension === 'avif') return 'image/avif'
  if (extension === 'jpeg') return 'image/jpeg'
  if (extension === 'jxl') return 'image/jxl'
  if (extension === 'png') return 'image/png'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  return 'application/octet-stream'
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
} satisfies ExportedHandler<Env>
