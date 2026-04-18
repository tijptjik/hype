import { error } from '@sveltejs/kit'
import {
  getOriginalsBucketForStage,
  readManifestVersion,
  toImageStage,
} from '$lib/images/storage'

export const GET = async ({ params, platform }) => {
  const segments = (params.path ?? '').split('/').filter(Boolean)
  if (segments.length === 0) throw error(400, 'Invalid image path')

  const publicIdSegments: string[] = []
  let version: number | undefined

  for (const segment of segments) {
    if (/^v\d+$/.test(segment)) {
      version = Number(segment.slice(1))
      continue
    }

    if (
      segment.startsWith('c_') ||
      segment.startsWith('g_') ||
      segment.startsWith('f_') ||
      segment.startsWith('q_') ||
      segment.startsWith('e_')
    ) {
      continue
    }

    publicIdSegments.push(segment)
  }

  const publicId = publicIdSegments.join('/')
  if (!publicId) throw error(400, 'Missing publicId')

  const bucket = getOriginalsBucketForStage(platform, toImageStage(params.appEnv))
  const resolvedVersion =
    typeof version === 'number' ? version : await readManifestVersion(bucket, publicId)

  const object = await bucket.get(publicId)
  if (!object) throw error(404, 'Image not found')

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': resolvedVersion
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300',
      etag: object.httpEtag,
    },
  })
}
