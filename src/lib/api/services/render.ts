import { error, json, redirect } from '@sveltejs/kit'

import { buildMapRenderJob } from '$lib/map/renders/jobs.server'
import { enqueueMapRenderJob } from '$lib/map/renders/queue.server'
import { resolveMapRenderAssetUrl } from '$lib/map/renders/storage.shared'
import type {
  MapRenderAssetKind,
  MapRenderJob,
  MapRenderRemoteConfig,
} from '$lib/types'

type RemoteStage = 'preview' | 'production'

type MapRenderPayloadSource = {
  styleCode: string
  featureRecords: unknown
  layers: unknown
  selectedLayerIds: string[]
}

const loadLocalMapRenderRuntime = async () =>
  await import('$lib/map/renders/local.server')

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
 * Normalizes the headless render payload shape returned to browser-render pages.
 *
 * @param renderData Entity-specific render data.
 * @returns Stable JSON payload for headless render clients.
 */
export const toMapRenderPayload = (renderData: MapRenderPayloadSource) => ({
  styleCode: renderData.styleCode,
  features: renderData.featureRecords,
  layers: renderData.layers,
  selectedLayerIds: renderData.selectedLayerIds,
})

/**
 * Redirects remote requests to immutable asset URLs or streams the dev-bucket object locally.
 *
 * @param params Asset lookup parameters.
 * @returns PNG response in local development.
 * @remarks Throws a redirect for preview/production and a 404 when the object is missing.
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
    throw redirect(
      307,
      resolveMapRenderAssetUrl(
        params.stage,
        {
          kind: params.kind,
          identifier: params.identifier,
          hash: params.hash,
        },
        `/${params.objectKey}`,
      ),
    )
  }

  const object = await params.platform?.env.ASSET_PUBLIC_DEV.get(params.objectKey)

  if (!object) {
    throw error(404, params.notFoundMessage)
  }

  return new Response(object.body, {
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

    return json({
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

  return json({
    ok: true,
    mode: 'local-generate',
    assetUrl,
    job,
    entries,
  })
}
