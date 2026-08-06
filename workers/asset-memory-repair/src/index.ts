/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from 'cloudflare:workers'

// 1. TYPES
// 2. CONSTANTS
// 3. REQUEST PARSING
// 4. R2 AND IMAGES REPAIR
// 5. TAIL HANDLER

type CropMode = 'c_fill' | 'c_fit' | 'c_thumb'
type GravityMode = 'g_auto' | 'g_center'
type OutputFormat = 'avif' | 'jpeg' | 'png' | 'webp'

type Env = {
  ASSET_RAW_PRODUCTION: R2Bucket
  ASSET_PUBLIC_PRODUCTION: R2Bucket
  IMAGES: ImagesBinding
  REPAIR_LOCK: DurableObjectNamespace<AssetMemoryRepairLock>
}

type RepairRequest = {
  canonicalTransform: string
  derivedKey: string
  format: OutputFormat
  gravity: GravityMode
  cropMode: CropMode
  publicId: string
  quality: string
  version?: number
  width?: number
  height?: number
}

type ParsedTransformRequest = Omit<RepairRequest, 'canonicalTransform' | 'derivedKey'>

const ASSET_SERVICE_PRODUCTION_NAME = 'hype-asset-service-prod'
const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable'
const MANIFEST_SUFFIX = '.manifest.json'
const MAX_IMAGES_INPUT_BYTES = 20 * 1024 * 1024
const MAX_TRANSFORM_DIMENSION = 4096
const REPAIR_LOCK_TTL_MS = 5 * 60 * 1000
const QUALITY_BY_FORMAT = {
  avif: 45,
  jpeg: 80,
  webp: 75,
} as const
const SUPPORTED_SOURCE_CONTENT_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

/**
 * Parses an exceeded-memory request URL into the same transform request used
 * by the production asset Worker.
 *
 * @param requestUrl Unredacted URL from an eligible Tail Worker trace.
 * @param accept Request Accept header, when available in the trace.
 * @returns Repair input, or null when the request cannot be reproduced safely.
 */
export const parseRepairRequest = (
  requestUrl: string,
  accept: string,
): ParsedTransformRequest | null => {
  let url: URL

  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }

  if (url.hostname !== 'assets.hype.hk') {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'image' || segments[1] !== 'upload') {
    return null
  }

  let version: number | undefined
  let cropMode: CropMode = 'c_fit'
  let gravity: GravityMode = 'g_auto'
  let quality = 'q_auto'
  let format: 'auto' | 'unsupported' | OutputFormat = 'auto'
  let width: number | undefined
  let height: number | undefined
  const publicIdSegments: string[] = []
  let modifiersComplete = false

  for (const segment of segments.slice(2)) {
    if (modifiersComplete) {
      publicIdSegments.push(segment)
      continue
    }

    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (looksLikeModifierSegment(segment)) {
      for (const part of segment.split(',')) {
        if (part.startsWith('c_')) {
          cropMode = toCropMode(part)
        } else if (part.startsWith('g_')) {
          gravity = toGravityMode(part)
        } else if (part.startsWith('f_')) {
          format = toExplicitFormat(part)
        } else if (part.startsWith('q_')) {
          quality = part
        } else if (part.startsWith('w_')) {
          width = clampDimension(part.slice(2))
        } else if (part.startsWith('h_')) {
          height = clampDimension(part.slice(2))
        }
      }
      continue
    }

    modifiersComplete = true
    publicIdSegments.push(segment)
  }

  if (publicIdSegments.length === 0) {
    return null
  }

  const rawPublicId = publicIdSegments.join('/')
  if (format === 'unsupported') {
    return null
  }

  if (format === 'auto') {
    const extensionFormat = extractExtensionFormat(rawPublicId)
    if (extensionFormat === 'unsupported') {
      return null
    }
    format = extensionFormat ?? chooseAutoOutputFormat(accept)
  }

  const publicId = stripKnownExtension(rawPublicId)
  if (!isProductionPublicId(publicId)) {
    return null
  }

  return {
    cropMode,
    format,
    gravity,
    publicId,
    quality,
    version,
    width,
    height,
  }
}

/**
 * Repairs a single immutable derived image. One Durable Object instance exists
 * per derived key, preventing concurrent Tail Worker events from duplicating
 * a paid Cloudflare Images transformation.
 */
export class AssetMemoryRepairLock extends DurableObject<Env> {
  /**
   * Generates and writes the requested derivative when it is not already present.
   *
   * @param request Parsed, canonicalized repair request.
   * @returns Resolves after the derivative exists or a non-repairable input is skipped.
   */
  async repair(request: RepairRequest): Promise<void> {
    const repairStartedAt = await this.ctx.storage.get<number>('repairStartedAt')
    if (
      repairStartedAt !== undefined &&
      Date.now() - repairStartedAt < REPAIR_LOCK_TTL_MS
    ) {
      return
    }

    // Persist the lease before external I/O so concurrent Tail events do not duplicate billing.
    await this.ctx.storage.put('repairStartedAt', Date.now())

    try {
      const existing = await this.env.ASSET_PUBLIC_PRODUCTION.head(request.derivedKey)
      if (existing) {
        return
      }

      const source = await getTransformableSource(this.env, request.publicId)
      if (!source?.body) {
        console.warn(
          JSON.stringify({
            event: 'asset-memory-repair-skipped',
            reason: source ? 'unsupported-source' : 'missing-source',
          }),
        )
        return
      }

      const transformed = await transformSource(this.env, source.body, request)

      // Persist exactly the immutable derivative that the normal asset Worker would cache.
      await this.env.ASSET_PUBLIC_PRODUCTION.put(
        request.derivedKey,
        transformed.image(),
        {
          httpMetadata: {
            cacheControl: CACHE_CONTROL_IMMUTABLE,
            contentType: transformed.contentType(),
          },
          customMetadata: {
            canonicalTransform: request.canonicalTransform,
            generatedAt: new Date().toISOString(),
            publicId: request.publicId,
            sourceObjectKey: source.key,
            sourceStage: 'production',
            transformProvider: 'cloudflare-images-tail-repair',
            version: request.version ? String(request.version) : 'latest',
          },
        },
      )

      console.log(
        JSON.stringify({
          event: 'asset-memory-repair-complete',
          transform: request.canonicalTransform,
        }),
      )
    } finally {
      // The R2 write is strongly consistent; releasing lets later events see its cheap head hit.
      await this.ctx.storage.delete('repairStartedAt')
    }
  }
}

/**
 * Selects a safe image source from the normalized primary object, with a
 * supported raw-object fallback for assets that have not yet been normalized.
 *
 * @param env Worker bindings.
 * @param publicId Canonical asset identifier.
 * @returns A streamable Images-binding source, or null when none is safe.
 */
const getTransformableSource = async (
  env: Env,
  publicId: string,
): Promise<{ body: ReadableStream<Uint8Array> | null; key: string } | null> => {
  for (const key of [publicId, `${publicId}.raw`]) {
    const object = await env.ASSET_RAW_PRODUCTION.get(key)
    if (!object) {
      continue
    }

    const contentType = object.httpMetadata?.contentType?.toLowerCase()
    if (
      object.size > MAX_IMAGES_INPUT_BYTES ||
      !contentType ||
      !SUPPORTED_SOURCE_CONTENT_TYPES.has(contentType)
    ) {
      continue
    }

    return { body: object.body, key }
  }

  return null
}

/**
 * Resolves a Tail Worker request to the exact production derived-cache key.
 *
 * @param env Worker bindings.
 * @param parsed Parsed URL transform.
 * @returns Repair request with the version and immutable R2 key resolved.
 */
const toRepairRequest = async (
  env: Env,
  parsed: ParsedTransformRequest,
): Promise<RepairRequest> => {
  const version =
    parsed.version ??
    (await readManifestVersion(env.ASSET_RAW_PRODUCTION, parsed.publicId))
  const canonicalTransform = toCanonicalTransformKey({ ...parsed, version })

  return {
    ...parsed,
    canonicalTransform,
    derivedKey: toDerivedObjectKey({
      canonicalTransform,
      publicId: parsed.publicId,
      version,
    }),
    version,
  }
}

/**
 * Executes the Cloudflare Images transform outside the Worker isolate's RGBA
 * memory budget.
 *
 * @param env Worker bindings.
 * @param source Raw R2 image stream.
 * @param request Normalized transform request.
 * @returns Streamable transformation result for direct R2 persistence.
 */
const transformSource = async (
  env: Env,
  source: ReadableStream<Uint8Array>,
  request: RepairRequest,
): Promise<ImageTransformationResult> => {
  const targetWidth = request.width ?? request.height
  const targetHeight = request.height ?? request.width
  const transformer = env.IMAGES.input(source)
  const transformed =
    targetWidth || targetHeight
      ? transformer.transform({
          ...(targetWidth ? { width: targetWidth } : {}),
          ...(targetHeight ? { height: targetHeight } : {}),
          fit:
            request.cropMode === 'c_fill' || request.cropMode === 'c_thumb'
              ? 'cover'
              : 'contain',
          gravity: request.gravity === 'g_auto' ? 'auto' : 'center',
        })
      : transformer

  return transformed.output({
    format: `image/${request.format}` as
      | 'image/avif'
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp',
    ...(request.format === 'png'
      ? {}
      : { quality: resolveQuality(request.quality, request.format) }),
  })
}

/**
 * Reads the latest version from the raw asset manifest.
 *
 * @param bucket Production raw asset bucket.
 * @param publicId Canonical asset identifier.
 * @returns Version number, or undefined when no manifest version is present.
 */
const readManifestVersion = async (
  bucket: R2Bucket,
  publicId: string,
): Promise<number | undefined> => {
  const manifest = await bucket.get(`${publicId}${MANIFEST_SUFFIX}`)
  if (!manifest) {
    return undefined
  }

  const json = (await manifest.json()) as { version?: unknown }
  return typeof json.version === 'number' ? json.version : undefined
}

/**
 * Builds the stable transform key shared with the production asset Worker.
 *
 * @param request Resolved transform request.
 * @returns Canonical transform key.
 */
const toCanonicalTransformKey = (request: ParsedTransformRequest): string =>
  [
    request.cropMode,
    request.width ? `w_${request.width}` : null,
    request.height ? `h_${request.height}` : null,
    request.gravity,
    request.quality,
    `f_${request.format}`,
  ]
    .filter(Boolean)
    .join(',')

/**
 * Builds the production derived-cache object key.
 *
 * @param params Canonical derivative key parts.
 * @returns R2 object key.
 */
const toDerivedObjectKey = (params: {
  canonicalTransform: string
  publicId: string
  version?: number
}): string =>
  `${params.publicId}/${params.version ? `v${params.version}` : 'latest'}/${params.canonicalTransform}`

/**
 * Returns the output format selected by the production Worker for `f_auto`.
 *
 * @param accept Request Accept header.
 * @returns WebP when advertised, otherwise JPEG.
 */
const chooseAutoOutputFormat = (accept: string): OutputFormat =>
  accept.includes('image/webp') ? 'webp' : 'jpeg'

/**
 * Normalizes a crop modifier to the modes supported by the asset Worker.
 *
 * @param value Raw crop modifier.
 * @returns Supported crop mode.
 */
const toCropMode = (value: string): CropMode =>
  value === 'c_fill' || value === 'c_thumb' ? value : 'c_fit'

/**
 * Normalizes a gravity modifier to the modes supported by the asset Worker.
 *
 * @param value Raw gravity modifier.
 * @returns Supported gravity mode.
 */
const toGravityMode = (value: string): GravityMode =>
  value === 'g_center' ? 'g_center' : 'g_auto'

/**
 * Normalizes an output modifier to a format supported by Cloudflare Images.
 *
 * @param value Raw format modifier.
 * @returns Explicit output format, `auto`, or an unsupported sentinel.
 */
const toExplicitFormat = (value: string): 'auto' | 'unsupported' | OutputFormat => {
  if (value === 'f_auto') return 'auto'
  if (value === 'f_avif') return 'avif'
  if (value === 'f_png') return 'png'
  if (value === 'f_webp') return 'webp'
  if (value === 'f_jxl' || value === 'f_svg') return 'unsupported'
  return 'jpeg'
}

/**
 * Determines whether a path segment is a Cloudinary-compatible modifier group.
 *
 * @param segment Path segment.
 * @returns Whether the segment contains transform modifiers.
 */
const looksLikeModifierSegment = (segment: string): boolean =>
  ['c_', 'g_', 'f_', 'q_', 'e_', 'w_', 'h_'].some(prefix => segment.startsWith(prefix))

/**
 * Removes a known image extension from a public identifier.
 *
 * @param publicId Public id from the delivery path.
 * @returns Extensionless canonical public id.
 */
const stripKnownExtension = (publicId: string): string =>
  publicId.replace(/\.(avif|jpe?g|jxl|png|svg|webp)$/iu, '')

/**
 * Reads an explicit delivery extension exactly as the asset Worker does.
 * Formats the Images binding cannot reproduce are marked unsupported.
 *
 * @param publicId Public id from the delivery path.
 * @returns Output format, unsupported sentinel, or null when no known extension exists.
 */
const extractExtensionFormat = (
  publicId: string,
): 'unsupported' | OutputFormat | null => {
  const extension = publicId.split('.').pop()?.toLowerCase()
  if (extension === 'avif') return 'avif'
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'png') return 'png'
  if (extension === 'webp') return 'webp'
  if (extension === 'jxl' || extension === 'svg') return 'unsupported'
  return null
}

/**
 * Restricts automatic repair to owned, path-safe production public ids.
 *
 * @param publicId Candidate public id.
 * @returns Whether the identifier can safely address the production R2 bucket.
 */
const isProductionPublicId = (publicId: string): boolean =>
  publicId.startsWith('h/') &&
  !publicId.includes('..') &&
  publicId.split('/').every(segment => segment.length > 0)

/**
 * Converts a raw dimension modifier into the production Worker range.
 *
 * @param value Raw dimension value.
 * @returns Clamped dimension, or undefined when invalid.
 */
const clampDimension = (value: string): number | undefined =>
  isIntegerString(value)
    ? Math.min(MAX_TRANSFORM_DIMENSION, Math.max(1, Number(value)))
    : undefined

/**
 * Resolves a numeric encoder quality using the production defaults.
 *
 * @param rawQuality Raw `q_*` modifier.
 * @param format Output format.
 * @returns Quality within the Images binding range.
 */
const resolveQuality = (
  rawQuality: string,
  format: keyof typeof QUALITY_BY_FORMAT,
): number => {
  if (rawQuality.startsWith('q_') && isIntegerString(rawQuality.slice(2))) {
    return Math.min(100, Math.max(1, Number(rawQuality.slice(2))))
  }

  return QUALITY_BY_FORMAT[format]
}

/**
 * Determines whether a string is a decimal integer.
 *
 * @param value Candidate string.
 * @returns Whether the string contains only base-10 digits.
 */
const isIntegerString = (value: string): boolean => /^\d+$/u.test(value)

/**
 * Returns the unredacted URL only for a qualifying production fetch trace.
 * The URL is used in memory and intentionally never emitted to logs.
 *
 * @param trace Tail Worker trace event.
 * @returns URL and Accept header required to recreate the transform, or null.
 */
const getRepairTraceRequest = (
  trace: TraceItem,
): { accept: string; url: string } | null => {
  if (
    trace.scriptName !== ASSET_SERVICE_PRODUCTION_NAME ||
    trace.outcome !== 'exceededMemory' ||
    !trace.event ||
    !('request' in trace.event)
  ) {
    return null
  }

  const request = trace.event.request
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null
  }

  try {
    const unredacted = request.getUnredacted()
    return {
      accept: unredacted.headers.accept ?? unredacted.headers.Accept ?? '',
      url: unredacted.url,
    }
  } catch {
    return null
  }
}

export default {
  /**
   * Repairs production image derivatives after the source asset Worker was
   * terminated for exceeding its memory budget.
   *
   * @param events Completed producer Worker traces.
   * @param env Worker bindings.
   * @param ctx Tail execution context.
   * @returns Resolves after repair jobs have been scheduled.
   */
  async tail(events: TraceItem[], env: Env, ctx: ExecutionContext): Promise<void> {
    const repairs = events.flatMap(trace => {
      const traceRequest = getRepairTraceRequest(trace)
      if (!traceRequest) {
        return []
      }

      const parsed = parseRepairRequest(traceRequest.url, traceRequest.accept)
      return parsed ? [{ parsed }] : []
    })

    if (repairs.length === 0) {
      return
    }

    ctx.waitUntil(
      Promise.all(
        repairs.map(async ({ parsed }) => {
          const repair = await toRepairRequest(env, parsed)
          const lock = env.REPAIR_LOCK.getByName(repair.derivedKey)
          await lock.repair(repair)
        }),
      ).catch(error => {
        console.error(
          JSON.stringify({
            event: 'asset-memory-repair-failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }),
    )
  },
} satisfies ExportedHandler<Env>
