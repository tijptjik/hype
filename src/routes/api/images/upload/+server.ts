import { error, json } from '@sveltejs/kit'
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

export const POST = async ({ request, platform }) => {
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
  const metadataInput = (
    typeof metadataRaw === 'string' && metadataRaw.length > 0
      ? (JSON.parse(metadataRaw) as UploadMetadataInput)
      : {}
  ) satisfies UploadMetadataInput

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
    uploadedAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  }

  await originalsBucket.put(payload.publicId, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
    },
  })
  await originalsBucket.put(
    toMetadataObjectKey(payload.publicId),
    JSON.stringify(document),
    {
      httpMetadata: { contentType: 'application/json' },
    },
  )
  await originalsBucket.put(
    toMetadataObjectKey(payload.publicId, version),
    JSON.stringify(document),
    {
      httpMetadata: { contentType: 'application/json' },
    },
  )
  await originalsBucket.put(
    toManifestObjectKey(payload.publicId),
    JSON.stringify({ version, publicId: payload.publicId, env: stage }),
    {
      httpMetadata: { contentType: 'application/json' },
    },
  )

  return json({
    cdn: 'cloudflareR2',
    env: stage,
    cdnId: null,
    publicId: payload.publicId,
    version,
  })
}
