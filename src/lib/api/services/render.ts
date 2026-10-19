// SVELTEKIT
import { error } from '@sveltejs/kit'
// HELPERS
import { buildMapRenderJob } from '#lib/map/renders/jobs.server.js'
import { enqueueMapRenderJob } from '#lib/map/renders/queue.server.js'
import { getMapRenderAssetBaseUrl } from '#lib/map/renders/storage.shared.js'
import {
  enqueueMissingMapRender,
  findLastSuccessfulMapRender,
} from '#lib/map/renders/recovery.server.js'
// TYPES
import type { Queue, R2Bucket, R2ObjectBody } from '@cloudflare/workers-types'
import type {
  MapRenderAssetKind,
  MapRenderJob,
  MapRenderRemoteConfig,
} from '#lib/map/renders/render.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. RUNTIME / PAYLOAD HELPERS
//    - getMapRenderRemoteConfig, isRemoteRenderStage, getMapRenderQueue
//    - getRemoteMapRenderBucket, toMapRenderPayload
// 2. ASSET DELIVERY AND REFRESH
//    - serveMapRenderAsset, runSingleMapRenderRefresh

type RemoteStage = 'preview' | 'production'

type MapRenderPayloadSource = {
  markerStylesByLayerId?: unknown
  styleCode: string
  featureRecords: unknown
  layers: unknown
  selectedLayerIds: string[]
}

const loadLocalMapRenderRuntime = async () =>
  await import('#lib/map/renders/local.server.js')

/**
 * Returns the R2 credentials used to persist local and remote map renders.
 *
 * @param platform Request platform bindings.
 * @returns Validated remote persistence config.
 * @remarks Throws a 500 when the required Cloudflare credentials are unavailable.
 */
export const getMapRenderRemoteConfig = (
  platform?: App.Platform,
): MapRenderRemoteConfig => {
  const env = platform?.env

  if (
    !env?.CLOUDFLARE_ACCOUNT_ID ||
    !env.R2_S3_ACCESS_KEY_ID ||
    !env.R2_S3_SECRET_ACCESS_KEY
  ) {
    throw error(500, 'Map render persistence is not configured.')
  }

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
  }
}

/**
 * Returns whether the current request targets a non-local runtime.
 *
 * @param stage Runtime environment value.
 * @returns `true` for preview/production, otherwise `false`.
 */
export const isRemoteRenderStage = (
  stage: string | null | undefined,
): stage is RemoteStage => stage === 'preview' || stage === 'production'

/**
 * Returns the queue binding used for asynchronous map render work.
 *
 * @param platform Request platform bindings.
 * @returns Queue binding for map render jobs.
 * @remarks Throws a 500 when the queue binding is unavailable.
 */
export const getMapRenderQueue = (platform?: App.Platform): Queue<MapRenderJob> => {
  const queue = platform?.env.MAP_RENDER_QUEUE

  if (!queue) {
    throw error(500, 'Map render queue binding is not available.')
  }

  return queue
}

/**
 * Selects the asset bucket belonging to the deployed app stage.
 * @param platform Request platform bindings.
 * @returns The current stage's bucket.
 * @remarks Never falls back across environments for deployed requests.
 */
export const getRemoteMapRenderBucket = (platform?: App.Platform): R2Bucket => {
  const env = platform?.env
  const bucket =
    env?.ENVIRONMENT === 'production'
      ? env.ASSET_PUBLIC_PRODUCTION
      : env?.ENVIRONMENT === 'preview'
        ? env.ASSET_PUBLIC_PREVIEW
        : undefined
  if (!bucket) throw error(500, 'Map render asset bucket is not available.')
  return bucket
}

/**
 * Normalizes the headless render payload shape returned to browser-render pages.
 *
 * @param renderData Entity-specific render data.
 * @returns Stable JSON payload for headless render clients.
 */
export const toMapRenderPayload = (renderData: MapRenderPayloadSource) => ({
  styleCode: renderData.styleCode,
  features: renderData.featureRecords,
  markerStylesByLayerId: renderData.markerStylesByLayerId,
  layers: renderData.layers,
  selectedLayerIds: renderData.selectedLayerIds,
})

/**
 * Redirects remote requests to immutable asset URLs or streams a matching object locally.
 *
 * @param params Asset lookup parameters.
 * @returns Local PNG or an uncached redirect to a completed remote version.
 * @remarks Local reads try dev, preview, then production for the exact content hash.
 * Remote misses queue repair and retain the last successful version; new entities return 404.
 */
export const serveMapRenderAsset = async (params: {
  platform?: App.Platform
  stage: string | null | undefined
  kind: Exclude<MapRenderAssetKind, 'styles'>
  identifier: string
  hash: string
  objectKey: string
  notFoundMessage: string
}): Promise<Response> => {
  if (isRemoteRenderStage(params.stage)) {
    const bucket = getRemoteMapRenderBucket(params.platform)
    let objectKey: string | null = params.objectKey
    if (!(await bucket.head(objectKey))) {
      // Queue repair without allowing an unavailable queue to hide a settled preview.
      try {
        const env = params.platform?.env
        await enqueueMissingMapRender(
          bucket,
          getMapRenderQueue(params.platform),
          buildMapRenderJob(
            env?.PUBLIC_ORIGIN,
            params.kind,
            params.identifier,
            params.hash,
            env?.MAP_RENDER_TOKEN,
          ),
        )
      } catch {
        console.error('Map preview repair enqueue failed', {
          kind: params.kind,
          identifier: params.identifier,
        })
      }
      objectKey = await findLastSuccessfulMapRender(
        bucket,
        `mapRender/${params.kind}/${params.identifier}/`,
      )
    }
    if (!objectKey) {
      return new Response(params.notFoundMessage, {
        status: 404,
        headers: { 'cache-control': 'no-store' },
      })
    }
    // Immutable renders live on the asset CDN; only the version-selection redirect is mutable.
    return new Response(null, {
      status: 307,
      headers: {
        location: `${getMapRenderAssetBaseUrl(params.stage)}/${objectKey}`,
        'cache-control': 'no-store',
      },
    })
  }

  // Imported databases can reference renders that exist only in a remote-stage bucket.
  const env = params.platform?.env
  let object: R2ObjectBody | null = null
  for (const bucket of [
    env?.ASSET_PUBLIC_DEV,
    env?.ASSET_PUBLIC_PREVIEW,
    env?.ASSET_PUBLIC_PRODUCTION,
  ]) {
    object = (await bucket?.get(params.objectKey)) ?? null
    if (object) break
  }

  if (!object) {
    throw error(404, params.notFoundMessage)
  }

  return new Response(object.body as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'cache-control': 'no-store',
      'content-type': object.httpMetadata?.contentType ?? 'image/png',
    },
  })
}

/**
 * Executes the shared single-entity refresh flow for layers and projects.
 *
 * @param params Refresh job parameters.
 * @returns JSON response describing the enqueue or local-generate result.
 */
export const runSingleMapRenderRefresh = async (params: {
  platform?: App.Platform
  publicOrigin: string
  stage: string | null | undefined
  kind: Exclude<MapRenderAssetKind, 'styles'>
  identifier: string
  hash: string
  renderToken?: string | null
}): Promise<Response> => {
  const job = buildMapRenderJob(
    params.publicOrigin,
    params.kind,
    params.identifier,
    params.hash,
    params.renderToken,
  )
  const assetUrl = `/api/mapRenders/${params.kind}/${params.identifier}/asset`

  if (isRemoteRenderStage(params.stage)) {
    await enqueueMapRenderJob(getMapRenderQueue(params.platform), job)

    return Response.json({
      ok: true,
      mode: 'enqueue',
      assetUrl,
      job,
    })
  }

  const { generateRenderJobsLocally } = await loadLocalMapRenderRuntime()
  const entries = await generateRenderJobsLocally([job], {
    baseUrl: params.publicOrigin,
    stage: 'local',
    remoteConfig: getMapRenderRemoteConfig(params.platform),
  })

  return Response.json({
    ok: true,
    mode: 'local-generate',
    assetUrl,
    job,
    entries,
  })
}
