// STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'

/** Resolve the same environment-specific bucket for readers and editors. @param platform Request bindings. @returns R2 namespace host. */
export function premisesMapBucket(platform: App.Platform): R2Bucket {
  return getOriginalsBucketForStage(platform, toImageStage(platform.env.ENVIRONMENT))
}

export type MapObjectReader = { get(key: string): Promise<R2ObjectBody | null> }

/** Read immutable published drawings referenced by this environment's database.
 * @param platform Request bindings. @returns A reader for the local and stage originals.
 * @remarks On Fi the admin and device servers share D1. Drawings published by the
 * local admin persona are stored in the local raw bucket even when the device
 * server uses remote bindings for other originals.
 */
export function publishedMapReader(platform: App.Platform): MapObjectReader {
  const primary = premisesMapBucket(platform)
  const local =
    platform.env.ENVIRONMENT === 'local' && platform.env.LOCAL_EXTERIOR_COMPARISONS
  if (!local || local === primary) return primary
  return { get: async key => (await local.get(key)) ?? primary.get(key) }
}
