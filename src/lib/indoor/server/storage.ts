// STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'

/** Resolve the environment-specific originals bucket. @param platform Request bindings. @returns R2 namespace host. */
export function premisesMapBucket(platform: App.Platform): R2Bucket {
  return getOriginalsBucketForStage(platform, toImageStage(platform.env.ENVIRONMENT))
}

export type MapObjectReader = { get(key: string): Promise<R2ObjectBody | null> }

export type MapObjectStorage = MapObjectReader & Pick<R2Bucket, 'put'>

/** Resolve storage for indoor releases, drafts and their source evidence.
 * @param platform Request bindings.
 * @returns The map store for this environment.
 * @remarks Local servers share D1. Keep their edits in the same local originals bucket
 * and fall back to stage originals for objects referenced by the mirrored database.
 */
export function premisesMapStorage(platform: App.Platform): MapObjectStorage {
  const stage = premisesMapBucket(platform)
  const local =
    platform.env.ENVIRONMENT === 'local' && platform.env.LOCAL_EXTERIOR_COMPARISONS
  if (!local || local === stage) return stage
  return {
    get: async key => (await local.get(key)) ?? stage.get(key),
    put: local.put.bind(local),
  }
}
