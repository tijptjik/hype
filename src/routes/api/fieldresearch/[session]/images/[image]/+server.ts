// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// DOMAIN
import { researchRequest } from '#lib/fieldResearch/server.js'
import {
  type ResearchUploadMetadata,
  ResearchUploadMetadataSchema,
} from '#lib/fieldResearch/model.js'
// DB
import {
  fieldResearchImage as images,
  fieldResearchSession as sessions,
} from '#lib/db/schema/fieldResearch.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { readResearchSession } from '#lib/db/services/fieldResearch.js'
// STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
// TYPES
import type { RequestHandler } from './$types'

// TABLE OF CONTENTS
// 1. Private provisional asset reads
// 2. Idempotent single-file uploads

const MAX_FILE_BYTES = 32 * 1024 * 1024

/** Deliver a provisional image only to authorized project managers.
 * @param event Scoped session/image request.
 * @returns Private image bytes; no public cache or Feature association is created.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const { db } = await researchRequest(locals, params.session)
  const row = await db
    .select()
    .from(images)
    .where(
      and(
        eq(images.id, params.image),
        eq(images.sessionId, params.session),
        eq(images.state, 'uploaded'),
      ),
    )
    .get()
  if (!row) error(404, 'Image not found')
  const bucket = getOriginalsBucketForStage(locals.platform, toImageStage(row.env))
  const preview =
    url.searchParams.get('preview') === '1'
      ? await bucket.get(`${row.storageKey}.thumbnail.jpg`)
      : null
  const object = preview ?? (await bucket.get(row.storageKey))
  if (!object) error(404, 'Image bytes not found')
  // Workers and DOM type packages describe the same stream with different generic declarations.
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'content-type': preview ? 'image/jpeg' : row.mediaType,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Upload one normalized image with a stable queue ID and retain its capture evidence.
 * @param event Multipart file and metadata scoped to an existing private session.
 * @returns Durable image identity after R2 and database confirmation.
 * @remarks Retries reuse the same key/hash. Failed confirmations retain recoverable bytes;
 * no fixed session image-count limit or Feature/gallery write occurs here.
 */
export const POST: RequestHandler = async ({ request, params, locals, url }) => {
  const { db } = await researchRequest(locals, params.session)
  if (request.headers.get('origin') !== url.origin) error(403, 'Invalid upload origin')
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(params.image)) error(400, 'Invalid image identity')
  if (
    Number(request.headers.get('content-length')) >
    MAX_FILE_BYTES + 256 * 1024 + 65536
  )
    error(413, 'Image is too large')
  const session = await readResearchSession(db, params.session)
  if (session.status === 'completed') error(409, 'Reopen the session before uploading')
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES)
    error(400, 'Choose an image up to 32 MiB after processing')
  let metadata: ResearchUploadMetadata
  try {
    metadata = ResearchUploadMetadataSchema.parse(
      JSON.parse(String(form.get('metadata'))),
    )
  } catch {
    error(400, 'Invalid image metadata')
  }
  const bytes = await file.arrayBuffer()
  const signature = new Uint8Array(bytes)
  // Accept the raster formats emitted by the shared normalizer; never serve uploaded HTML/SVG.
  const mediaType =
    signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      ? 'image/jpeg'
      : signature[0] === 137 &&
          signature[1] === 80 &&
          signature[2] === 78 &&
          signature[3] === 71
        ? 'image/png'
        : String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
          ? 'image/webp'
          : String.fromCharCode(...signature.slice(4, 8)) === 'ftyp' &&
              ['avif', 'avis'].some(brand =>
                new TextDecoder().decode(signature.slice(8, 40)).includes(brand),
              )
            ? 'image/avif'
            : null
  if (!mediaType) error(415, 'This image format could not be processed')
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
  const env = toImageStage(locals.platform?.env.ENVIRONMENT)
  const storageKey = `field-research/${session.id}/${params.image}`
  const now = new Date().toISOString()
  const existing = await db
    .select()
    .from(images)
    .where(eq(images.id, params.image))
    .get()
  if (existing && (existing.sessionId !== session.id || existing.contentHash !== hash))
    error(409, 'Queue identity already belongs to another image')
  if (existing?.state === 'uploaded') return json({ id: existing.id })
  // Reserve the identity before touching R2; pending rows make interrupted uploads visible.
  const reserved = await executeRevisionBatch(
    db,
    sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${session.id} AND status!='completed')`,
    [
      db
        .insert(images)
        .values({
          id: params.image,
          sessionId: session.id,
          state: 'uploading',
          filename: metadata.originalFilename,
          longitude: metadata.coordinates?.[0] ?? null,
          latitude: metadata.coordinates?.[1] ?? null,
          capturedAt: metadata.capturedAt,
          contentHash: hash,
          storageKey,
          env,
          mediaType,
          byteSize: bytes.byteLength,
          metadata: JSON.stringify(metadata),
          createdAt: now,
        })
        .onConflictDoNothing(),
      db
        .update(sessions)
        .set({
          status: 'uploading',
          updatedAt: now,
          revision: sql`${sessions.revision}+1`,
        })
        .where(eq(sessions.id, session.id)),
    ],
  )
  if (!reserved) error(409, 'Session is no longer open')
  const reservedRow = await db
    .select()
    .from(images)
    .where(eq(images.id, params.image))
    .get()
  if (
    !reservedRow ||
    reservedRow.sessionId !== session.id ||
    reservedRow.contentHash !== hash
  )
    error(409, 'Queue identity changed')
  const bucket = getOriginalsBucketForStage(
    locals.platform,
    toImageStage(reservedRow.env),
  )
  const stored = await bucket.put(storageKey, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: mediaType },
    customMetadata: { sha256: hash },
  })
  if (!stored) {
    const head = await bucket.head(storageKey)
    if (head?.size !== bytes.byteLength || head.customMetadata?.sha256 !== hash)
      error(409, 'Stored image does not match this upload')
  }
  const thumbnail = form.get('thumbnail')
  if (thumbnail instanceof File) {
    if (thumbnail.size > 256 * 1024) error(400, 'Preview is too large')
    const preview = await thumbnail.arrayBuffer()
    const signature = new Uint8Array(preview)
    if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255)
      error(400, 'Invalid preview')
    // Preview retries may reuse existing bytes; originals remain separately immutable.
    await bucket.put(`${storageKey}.thumbnail.jpg`, preview, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'image/jpeg' },
    })
  }
  // Extend the retained capture extent in constant time using original, successfully stored GPS.
  await db.batch([
    db
      .update(images)
      .set({ state: 'uploaded' })
      .where(and(eq(images.id, params.image), eq(images.contentHash, hash))),
    db
      .update(sessions)
      .set({
        west:
          reservedRow.longitude === null
            ? sessions.west
            : sql`min(coalesce(${sessions.west},${reservedRow.longitude}),${reservedRow.longitude})`,
        south:
          reservedRow.latitude === null
            ? sessions.south
            : sql`min(coalesce(${sessions.south},${reservedRow.latitude}),${reservedRow.latitude})`,
        east:
          reservedRow.longitude === null
            ? sessions.east
            : sql`max(coalesce(${sessions.east},${reservedRow.longitude}),${reservedRow.longitude})`,
        north:
          reservedRow.latitude === null
            ? sessions.north
            : sql`max(coalesce(${sessions.north},${reservedRow.latitude}),${reservedRow.latitude})`,
        updatedAt: new Date().toISOString(),
        revision: sql`${sessions.revision}+1`,
      })
      .where(eq(sessions.id, session.id)),
  ])
  return json({ id: params.image })
}
