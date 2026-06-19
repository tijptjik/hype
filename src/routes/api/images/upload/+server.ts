// SVELTE
import { error, json, type RequestHandler } from '@sveltejs/kit'
// API
import { verifyUploadToken } from '$lib/images/auth'
import {
  getOriginalsBucketForStage,
  toImageStage,
  toManifestObjectKey,
  toMetadataObjectKey,
} from '$lib/images/storage'

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

type UploadedObjectSnapshot = {
  key: string
  body: ArrayBuffer
  httpMetadata?: R2HTTPMetadata
  customMetadata?: Record<string, string>
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. TYPES
// - UploadMetadataInput
// - UploadWrite
// - OriginalsBucket
// - UploadedObjectSnapshot
//
// 1. INPUT HELPERS
// - parseUploadMetadataInput
//
// 2. STORAGE HELPERS
// - isUploadedObjectSnapshot
// - readExistingObjectSnapshots
// - deleteUploadedObjects
// - restoreUploadedObjects
// - rollbackUploadedObjects
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
 * Narrows a rollback snapshot to an object that can be restored.
 *
 * @param snapshot Previously captured object snapshot or absence marker.
 * @returns Whether the snapshot contains a restorable object body.
 */
const isUploadedObjectSnapshot = (
  snapshot: UploadedObjectSnapshot | null | undefined,
): snapshot is UploadedObjectSnapshot => Boolean(snapshot)

/**
 * Reads any objects that already exist before a replacement upload starts.
 *
 * @param bucket Originals bucket bound for the current stage.
 * @param keys Object keys that may be overwritten by the upload.
 * @returns Existing object snapshots keyed by object key; `null` means absent.
 * @remarks Replacement uploads intentionally reuse the current public id, so
 * rollback needs the previous bytes instead of blindly deleting written keys.
 */
const readExistingObjectSnapshots = async (
  bucket: OriginalsBucket,
  keys: string[],
): Promise<Map<string, UploadedObjectSnapshot | null>> => {
  const snapshots = new Map<string, UploadedObjectSnapshot | null>()
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)))

  for (const key of uniqueKeys) {
    const existing = await bucket.get(key)

    if (!existing) {
      snapshots.set(key, null)
      continue
    }

    snapshots.set(key, {
      key,
      body: await existing.arrayBuffer(),
      httpMetadata: existing.httpMetadata,
      customMetadata: existing.customMetadata,
    })
  }

  return snapshots
}

/**
 * Removes any objects written before a later upload persistence failure.
 *
 * @param bucket Originals bucket bound for the current stage.
 * @param keys Object keys to delete.
 * @returns Nothing.
 */
const deleteUploadedObjects = async (
  bucket: OriginalsBucket,
  keys: string[],
): Promise<void> => {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)))

  if (uniqueKeys.length === 0) return

  try {
    await bucket.delete(uniqueKeys)
  } catch (cleanupError) {
    console.error('[api.images.upload] rollback cleanup failed', {
      keys: uniqueKeys,
      cleanupError,
    })
  }
}

/**
 * Restores pre-existing objects that were overwritten before rollback.
 *
 * @param bucket Originals bucket bound for the current stage.
 * @param snapshots Object bodies captured before writes began.
 * @returns Nothing.
 */
const restoreUploadedObjects = async (
  bucket: OriginalsBucket,
  snapshots: UploadedObjectSnapshot[],
): Promise<void> => {
  for (const snapshot of snapshots) {
    const options: R2PutOptions = {}

    if (snapshot.httpMetadata) options.httpMetadata = snapshot.httpMetadata
    if (snapshot.customMetadata) options.customMetadata = snapshot.customMetadata

    try {
      await bucket.put(snapshot.key, snapshot.body, options)
    } catch (cleanupError) {
      console.error('[api.images.upload] rollback restore failed', {
        key: snapshot.key,
        cleanupError,
      })
    }
  }
}

/**
 * Undoes successful writes after a later upload persistence failure.
 *
 * @param params Rollback inputs.
 * @returns Nothing.
 * @remarks Objects that existed before the request are restored; only keys
 * known to have been newly created by this request are deleted.
 */
const rollbackUploadedObjects = async (params: {
  bucket: OriginalsBucket
  writtenKeys: string[]
  existingSnapshots: Map<string, UploadedObjectSnapshot | null> | null
}): Promise<void> => {
  const uniqueWrittenKeys = Array.from(new Set(params.writtenKeys.filter(Boolean)))
  const keysToDelete = uniqueWrittenKeys.filter(key => {
    if (!params.existingSnapshots) return true
    return params.existingSnapshots.get(key) === null
  })
  const snapshotsToRestore = uniqueWrittenKeys
    .map(key => params.existingSnapshots?.get(key))
    .filter(isUploadedObjectSnapshot)
    .reverse()

  await deleteUploadedObjects(params.bucket, keysToDelete)
  await restoreUploadedObjects(params.bucket, snapshotsToRestore)
}

/**
 * Persists the upload and sidecars in a recoverable order.
 *
 * @param params Upload persistence inputs.
 * @returns Nothing.
 * @remarks The manifest is written last so readers do not resolve a new version
 * until both the original file and metadata sidecars already exist.
 */
const persistUploadedObjects = async (params: {
  bucket: OriginalsBucket
  publicId: string
  writes: UploadWrite[]
  snapshotExistingObjects: boolean
}): Promise<void> => {
  const writtenKeys: string[] = []
  let existingSnapshots: Map<string, UploadedObjectSnapshot | null> | null = null

  try {
    if (params.snapshotExistingObjects) {
      // Capture replacement targets before writes so rollback can restore them.
      existingSnapshots = await readExistingObjectSnapshots(
        params.bucket,
        params.writes.map(write => write.key),
      )
    }

    for (const write of params.writes) {
      await params.bucket.put(write.key, write.body, {
        httpMetadata: { contentType: write.contentType },
      })
      writtenKeys.push(write.key)
    }
  } catch (cause) {
    await rollbackUploadedObjects({
      bucket: params.bucket,
      writtenKeys,
      existingSnapshots,
    })

    console.error('[api.images.upload] upload persistence failed', {
      publicId: params.publicId,
      writtenKeys,
      cause,
    })

    throw error(500, 'Failed to persist uploaded image')
  }
}

/**
 * Accepts an authenticated image upload and persists the original object plus
 * its metadata sidecars.
 *
 * @param event Incoming SvelteKit request event.
 * @returns Upload persistence result for the client.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
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

  // Write the versioned sidecar first, then the original object, and only
  // publish the live metadata/manifest once the full upload is durable.
  const serializedDocument = JSON.stringify(document)
  const writes: UploadWrite[] = [
    {
      key: toMetadataObjectKey(payload.publicId, version),
      body: serializedDocument,
      contentType: 'application/json',
    },
    {
      key: payload.publicId,
      body: await file.arrayBuffer(),
      contentType: file.type,
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
    snapshotExistingObjects: Boolean(payload.replaceImageId),
  })

  return json({
    cdn: 'cloudflareR2',
    env: stage,
    cdnId: null,
    publicId: payload.publicId,
    version,
  })
}
