// STORAGE
import { getOriginalsBucketForStage, toImageStage } from '#lib/images/storage.js'
import type { R2Bucket } from '@cloudflare/workers-types'

/** Resolve the same environment-specific bucket for readers and editors. @param platform Request bindings. @returns R2 namespace host. */
export function premisesMapBucket(platform: App.Platform): R2Bucket {
  return getOriginalsBucketForStage(platform, toImageStage(platform.env.ENVIRONMENT))
}
