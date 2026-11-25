// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { setupRequestHandler } from '#lib/api/index.js'
// SERVICES
import {
  recorderPhotoScope,
  readRecorderEditor,
} from '#lib/db/services/recorderEditor.js'
import { saveDirectFeatureUpload } from '#lib/db/services/featureLifecycleUpload.js'
// STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
import {
  recorderPhotoLimit,
  recorderPhotoTypes,
} from '#lib/fieldResearch/recorderPhotos.js'
// TYPES
import type { RequestHandler } from './$types'

// TABLE OF CONTENTS
// 1. Bounded photo input
// 2. Scoped, replayable gallery upload

/** @param request One original with a declared byte count. @returns Bounded image bytes. */
async function photoBytes(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const size = Number(request.headers.get('x-photo-size'))
  if (size > recorderPhotoLimit) error(413, 'Photo exceeds the gallery limit')
  if (!Number.isSafeInteger(size) || size <= 0 || !request.body)
    error(400, 'Missing photo size or body')
  const bytes = new Uint8Array(size)
  let offset = 0
  const reader = request.body.getReader()
  // Stream into a bounded buffer even when the HTTP body has no Content-Length.
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    if (offset + chunk.value.length > size) {
      await reader.cancel()
      error(400, 'Photo size mismatch')
    }
    bytes.set(chunk.value, offset)
    offset += chunk.value.length
  }
  if (offset !== size) error(400, 'Incomplete photo')
  return bytes
}

/** @param bytes Original photo. @returns Recognized camera or picker media type. */
function photoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte))
    return 'image/png'
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return null
}

/** Attach a selected original to the currently editable record.
 * @param event Authenticated photo upload. @returns Updated editor including its new revision and gallery.
 * @remarks The same actor, record and capture ID can retry a lost acknowledgement without another attachment.
 */
export const PUT: RequestHandler = async event => {
  const { params, request, locals } = event
  if (!z.uuid().safeParse(params.photo).success) error(400, 'Invalid photo identity')
  const platform = locals.platform ?? event.platform
  const ctx = await setupRequestHandler({ locals, platform, request })
  if (ctx.user.isAnonymous) error(403, 'Sign in to HYPE')
  const scope = await recorderPhotoScope(ctx, params.id)
  const mediaType = request.headers.get('content-type') ?? ''
  if (!recorderPhotoTypes.includes(mediaType)) error(415, 'Unsupported photo type')
  const bytes = await photoBytes(request)
  if (photoType(bytes) !== mediaType) error(415, 'Invalid photo type')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  const stage = toImageStage(platform?.env.ENVIRONMENT)
  const bucket = getOriginalsBucketForStage(platform, stage)
  const key = `h/features/${scope.featureId}/recorder/${ctx.user.id}/${params.photo}`
  // Reserve an immutable original. A racing retry may only finalize the same bytes.
  const stored = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: digest,
    httpMetadata: { contentType: mediaType },
  })
  if (!stored) {
    const existing = await bucket.head(key)
    if (existing?.checksums.toJSON().sha256 !== hash || existing.size !== bytes.length)
      error(409, 'Photo identity already used for different bytes')
  }
  const version = Date.now()
  await saveDirectFeatureUpload(ctx.db, {
    ...scope,
    actorId: ctx.user.id,
    reason: 'Field research photo added',
    storageNamespace: stage,
    storageKey: key,
    hash,
    mediaType,
    bytes: bytes.buffer,
    intent: 'undefined',
    deriveMetadata: () => ({
      version,
      presentationMode: 'contain',
      uploadedAt: new Date(version).toISOString(),
      originalFilename: event.url.searchParams.get('filename')?.slice(0, 255),
    }),
  })
  return json(await readRecorderEditor(ctx, params.id))
}
