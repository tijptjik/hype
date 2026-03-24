import { error, json } from '@sveltejs/kit'
import {
  readMetadataDocument,
  toImageStage,
  toMetadataProfilePayload,
} from '$lib/server/image-storage'
import { ImageMetadataProfileSchema } from '$lib/db/zod'

const isProfileSegment = (segment: string): boolean => segment.startsWith('p_')
const isFormatSegment = (segment: string): boolean => segment.startsWith('f_')
const isVersionSegment = (segment: string): boolean => /^v\d+$/.test(segment)

export const GET = async ({ params, platform }) => {
  const segments = (params.path ?? '').split('/').filter(Boolean)
  if (segments.length === 0) throw error(400, 'Invalid metadata path')

  let profile = 'basic'
  let version: number | undefined
  const publicIdSegments: string[] = []

  for (const segment of segments) {
    if (isProfileSegment(segment)) {
      profile = segment.slice(2)
      continue
    }
    if (isFormatSegment(segment)) {
      continue
    }
    if (isVersionSegment(segment)) {
      version = Number(segment.slice(1))
      continue
    }
    publicIdSegments.push(segment)
  }

  const publicId = publicIdSegments.join('/')
  if (!publicId) throw error(400, 'Missing publicId')

  const normalizedProfile = ImageMetadataProfileSchema.parse(profile)
  const { document } = await readMetadataDocument({
    platform,
    env: toImageStage(params.appEnv),
    publicId,
    version,
  })

  if (!document) throw error(404, 'Image metadata not found')

  return json(toMetadataProfilePayload(document, normalizedProfile))
}
