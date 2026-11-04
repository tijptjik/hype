// SVELTE
import { error, type RequestHandler } from '@sveltejs/kit'
// API
import { verifyUploadToken } from '#lib/images/auth.js'
import {
  getOriginalsBucketForStage,
  toImageStage,
  toManifestObjectKey,
  toMetadataObjectKey,
} from '#lib/images/storage.js'

type UploadMetadataInput = {
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
  latitude?: string | null
  longitude?: string | null
  metadata?: Record<string, string> | null
}

type UploadWrite = {
  key: string
  body: string | ArrayBuffer
  contentType: string
}

type OriginalsBucket = ReturnType<typeof getOriginalsBucketForStage>

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. TYPES
// - UploadMetadataInput
// - UploadWrite
// - OriginalsBucket
//
// 1. INPUT HELPERS
// - parseUploadMetadataInput
//
// 2. STORAGE HELPERS
// - persistUploadedObjects
//
// 3. ROUTE HANDLERS
// - POST
//
// ---

/**
 * Parses optional JSON metadata submitted with the upload form.
 *
 * @param metadataRaw Raw form value for the `metadata` field.
 * @returns Normalized metadata input object.
 * @remarks Invalid JSON is treated as a client error so the route does not
 * attempt any storage writes with malformed metadata.
 */
const parseUploadMetadataInput = (
  metadataRaw: FormDataEntryValue | null,
): UploadMetadataInput => {
  if (typeof metadataRaw !== 'string' || metadataRaw.length === 0) {
    return {}
  }

  try {
    const parsed: unknown = JSON.parse(metadataRaw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw error(400, 'Invalid metadata payload')
    }
    return parsed as UploadMetadataInput
  } catch {
    throw error(400, 'Invalid metadata payload')
  }
}

/**
 * Persists the upload and sidecars without overwriting an existing destination.
 *
 * @param params Upload persistence inputs.
 * @returns Nothing.
 * @remarks The original reserves the destination before sidecars are written;
 * the manifest is published last. Partial writes are retained on failure because
 * confirmation may already reference the original. Start a fresh grant to retry.
 */
const persistUploadedObjects = async (params: {
  bucket: OriginalsBucket
  publicId: string
  writes: UploadWrite[]
}): Promise<void> => {
  for (const write of params.writes) {
    let created: Awaited<ReturnType<OriginalsBucket['put']>> | null
    try {
      // R2 evaluates the condition atomically, including competing direct PUTs.
      created = await params.bucket.put(write.key, write.body, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: write.contentType },
      })
    } catch (cause) {
      console.error('[api.images.upload] upload persistence failed', {
        publicId: params.publicId,
        key: write.key,
        cause,
      })
      throw error(500, 'Failed to persist uploaded image')
    }
    if (!created)
      throw error(412, 'Upload destination already exists; start a new upload')
  }
}

/**
 * Accepts an authenticated image upload and persists the original object plus
 * its metadata sidecars.
 *
 * @param event Incoming SvelteKit request event.
 * @returns Upload persistence result for the client.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { platform } = locals
  const formData = await request.formData()
  const file = formData.get('file')
  const token = formData.get('token') ?? request.headers.get('x-image-upload-token')
  const metadataRaw = formData.get('metadata')

  if (!(file instanceof File)) throw error(400, 'Missing file')
  if (typeof token !== 'string') throw error(400, 'Missing upload token')
  if (!platform?.env.AUTH_SECRET) throw error(500, 'Upload auth secret not available')

  const payload = await verifyUploadToken(token, platform.env.AUTH_SECRET)
  if (!payload) throw error(403, 'Invalid upload token')
  if (payload.contentType !== file.type)
    throw error(400, 'Upload content type mismatch')
  if (payload.size !== file.size) throw error(400, 'Upload size mismatch')

  const stage = toImageStage(payload.env)
  const originalsBucket = getOriginalsBucketForStage(platform, stage)
  const version = Date.now()
  const timestamp = new Date().toISOString()
  const metadataInput = parseUploadMetadataInput(metadataRaw)

  const document = {
    originalFilename: metadataInput.originalFilename ?? file.name,
    originalExtension:
      metadataInput.originalExtension ??
      file.name.split('.').pop()?.toLowerCase() ??
      null,
    originalWidth: metadataInput.originalWidth ?? null,
    originalHeight: metadataInput.originalHeight ?? null,
    cameraModel: metadataInput.cameraModel ?? null,
    capturedAt: metadataInput.capturedAt ?? null,
    credit: metadataInput.credit ?? null,
    latitude: metadataInput.latitude ?? null,
    longitude: metadataInput.longitude ?? null,
    metadata: metadataInput.metadata ?? null,
    sourceVersion: version,
    uploadedAt: timestamp,
    modifiedAt: timestamp,
  }

  // Reserve the original first, then write the versioned sidecar, and only
  // publish the live metadata/manifest once the full upload is durable.
  const serializedDocument = JSON.stringify(document)
  const writes: UploadWrite[] = [
    {
      key: payload.publicId,
      body: await file.arrayBuffer(),
      contentType: file.type,
    },
    {
      key: toMetadataObjectKey(payload.publicId, version),
      body: serializedDocument,
      contentType: 'application/json',
    },
    {
      key: toMetadataObjectKey(payload.publicId),
      body: serializedDocument,
      contentType: 'application/json',
    },
    {
      key: toManifestObjectKey(payload.publicId),
      body: JSON.stringify({ version, publicId: payload.publicId, env: stage }),
      contentType: 'application/json',
    },
  ]

  await persistUploadedObjects({
    bucket: originalsBucket,
    publicId: payload.publicId,
    writes,
  })

  return Response.json({
    cdn: 'cloudflareR2',
    env: stage,
    cdnId: null,
    publicId: payload.publicId,
    version,
  })
}
