import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { AwsClient } from 'aws4fetch'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

// TYPES
import type {
  MapRenderManifestEntry,
  MapRenderPersistenceTarget,
  MapRenderRemoteConfig,
  MapRenderJob,
  PreviewStage,
} from '../../types'
// HELPERS
import {
  MAP_STYLE_RENDER_BASE_URL,
  MAP_STYLE_RENDER_CAPTURE_SIZE,
  MAP_STYLE_RENDER_OUTPUT_SIZE,
  MAP_STYLE_RENDER_READY_SELECTOR,
} from '../styles/render.shared'
import { resolveMapRenderAssetUrl } from './storage.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SERVER ORCHESTRATION
//    - ensureRenderServer
//
// 2. LOCAL RENDERING
//    - renderMapRenderJobLocally
//    - generateRenderJobsLocally

const SERVER_START_TIMEOUT_MS = 45_000
const PREVIEW_READY_TIMEOUT_MS = 45_000
const LOCAL_RENDER_ROOT_DIR = path.join(os.tmpdir(), 'hype-map-renders')
const RENDER_PUBLIC_BUCKET_BY_STAGE = {
  local: 'hype-assets-dev',
  preview: 'hype-assets-preview',
  production: 'hype-assets-prod',
} as const
const MAP_ENTITY_PREVIEW_SIZE = {
  width: 512,
  height: 512,
} as const

type GenerateRenderJobsLocallyOptions = {
  baseUrl?: string
  browser?: Awaited<ReturnType<typeof chromium.launch>>
  storage?: MapRenderPersistenceTarget
  stage?: PreviewStage
  remoteConfig?: MapRenderRemoteConfig
  force?: boolean
  onProgress?: (event: {
    job: MapRenderJob
    index: number
    total: number
    stage: 'started' | 'completed'
    entry?: MapRenderManifestEntry
  }) => void
}

const isServerReachable = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' })
    return response.ok || response.status === 304 || response.status === 307
  } catch {
    return false
  }
}

const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const getRenderPublicBucketName = (
  stage: PreviewStage,
): (typeof RENDER_PUBLIC_BUCKET_BY_STAGE)[keyof typeof RENDER_PUBLIC_BUCKET_BY_STAGE] => {
  if (stage === 'local' || stage === 'preview' || stage === 'production') {
    return RENDER_PUBLIC_BUCKET_BY_STAGE[stage]
  }

  throw new Error('Map render persistence requires a valid stage')
}

const persistRemoteRender = async (params: {
  stage: PreviewStage
  objectKey: string
  contentType: string
  body: ArrayBuffer
  remoteConfig: MapRenderRemoteConfig
}): Promise<void> => {
  const bucket = getRenderPublicBucketName(params.stage)
  const aws = new AwsClient({
    accessKeyId: params.remoteConfig.accessKeyId,
    secretAccessKey: params.remoteConfig.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const targetUrl = new URL(
    `https://${params.remoteConfig.accountId}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKeyPath(params.objectKey)}`,
  )
  const response = await aws.fetch(targetUrl, {
    method: 'PUT',
    headers: {
      'content-type': params.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: params.body,
  })

  if (!response.ok) {
    throw new Error(
      `Failed to persist remote mapRender asset (${response.status} ${response.statusText})`,
    )
  }
}

const doesRemoteRenderExist = async (params: {
  stage: PreviewStage
  objectKey: string
  remoteConfig: MapRenderRemoteConfig
}): Promise<boolean> => {
  const bucket = getRenderPublicBucketName(params.stage)
  const aws = new AwsClient({
    accessKeyId: params.remoteConfig.accessKeyId,
    secretAccessKey: params.remoteConfig.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const targetUrl = new URL(
    `https://${params.remoteConfig.accountId}.r2.cloudflarestorage.com/${bucket}/${encodeObjectKeyPath(params.objectKey)}`,
  )
  const response = await aws.fetch(targetUrl, { method: 'HEAD' })

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    throw new Error(
      `Failed to inspect remote mapRender asset (${response.status} ${response.statusText})`,
    )
  }

  return true
}

const waitForServer = async (baseUrl: string): Promise<void> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (await isServerReachable(baseUrl)) {
      return
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for preview server at ${baseUrl}`)
}

/**
 * Ensures a local preview server is reachable, starting `bun run dev` when needed.
 *
 * @param baseUrl Local app origin to verify.
 * @returns Disposable handle for the spawned server, if any.
 */
export const ensureRenderServer = async (
  baseUrl: string,
): Promise<{ dispose: () => void | Promise<void> }> => {
  if (await isServerReachable(baseUrl)) {
    return { dispose: () => undefined }
  }

  const server = spawn(
    'bun',
    ['run', 'dev', '--', '--host', 'localhost', '--port', '5173'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    },
  )

  await waitForServer(baseUrl)

  return {
    dispose: () => {
      server.kill()
    },
  }
}

const getRenderViewport = (job: MapRenderJob): { width: number; height: number } =>
  job.kind === 'styles' ? MAP_STYLE_RENDER_CAPTURE_SIZE : MAP_ENTITY_PREVIEW_SIZE

const getRenderOutputSize = (job: MapRenderJob): { width: number; height: number } =>
  job.kind === 'styles' ? MAP_STYLE_RENDER_OUTPUT_SIZE : MAP_ENTITY_PREVIEW_SIZE

const getLocalRenderAssetPath = (job: MapRenderJob): string =>
  `/api/mapRenders/${job.kind}/${job.identifier}/asset`

/**
 * Renders one preview job locally and stores the image under `/tmp/hype-map-renders/...`.
 *
 * @param job Queue-compatible map render job.
 * @returns Manifest entry for the rendered image.
 */
export const renderMapRenderJobLocally = async (
  job: MapRenderJob,
  options: {
    browser?: Awaited<ReturnType<typeof chromium.launch>>
    storage?: MapRenderPersistenceTarget
    stage?: PreviewStage
    remoteConfig?: MapRenderRemoteConfig
  } = {},
): Promise<MapRenderManifestEntry> => {
  const browser =
    options.browser ??
    (await chromium.launch({
      headless: true,
    }))
  const shouldCloseBrowser = !options.browser
  const stage = options.stage ?? 'local'
  const fileName = job.targetObjectKey.split('/').pop() ?? `${job.hash}.png`
  const tempPath = path.join(
    LOCAL_RENDER_ROOT_DIR,
    `${job.kind}-${job.identifier}.capture.png`,
  )

  try {
    const page = await browser.newPage({
      viewport: getRenderViewport(job),
      deviceScaleFactor: 1,
    })

    await mkdir(LOCAL_RENDER_ROOT_DIR, { recursive: true })

    await page.goto(job.sourceUrl, {
      waitUntil: 'load',
    })

    await page.waitForSelector(MAP_STYLE_RENDER_READY_SELECTOR, {
      timeout: PREVIEW_READY_TIMEOUT_MS,
    })

    await page.screenshot({
      path: tempPath,
    })

    const resizedBuffer = await sharp(tempPath)
      .resize(getRenderOutputSize(job).width, getRenderOutputSize(job).height, {
        fit: 'cover',
      })
      .png()
      .toBuffer()

    if (!options.remoteConfig) {
      throw new Error('Map render persistence requires remoteConfig')
    }
    await persistRemoteRender({
      stage,
      objectKey: job.targetObjectKey,
      contentType: 'image/png',
      body: resizedBuffer.buffer.slice(
        resizedBuffer.byteOffset,
        resizedBuffer.byteOffset + resizedBuffer.byteLength,
      ),
      remoteConfig: options.remoteConfig,
    })
    await rm(tempPath, { force: true })

    return {
      fileName,
      publicPath: `/${job.targetObjectKey}`,
      objectKey: job.targetObjectKey,
      publicUrl:
        stage === 'local'
          ? getLocalRenderAssetPath(job)
          : resolveMapRenderAssetUrl(
              stage,
              {
                kind: job.kind,
                identifier: job.identifier,
                hash: job.hash,
              },
              `/${job.targetObjectKey}`,
            ),
      hash: job.hash,
      sourceUrl: job.sourceUrl,
    }
  } finally {
    const pages = browser.contexts().flatMap(context => context.pages())
    await Promise.all(pages.map(page => page.close().catch(() => undefined)))
    if (shouldCloseBrowser) {
      await browser.close()
    }
  }
}

/**
 * Renders a batch of preview jobs locally with optional progress callbacks.
 *
 * @param jobs Queue-compatible map render jobs.
 * @param options Local render options.
 * @returns Manifest entries keyed by object key.
 */
export const generateRenderJobsLocally = async (
  jobs: MapRenderJob[],
  options: GenerateRenderJobsLocallyOptions = {},
): Promise<Record<string, MapRenderManifestEntry>> => {
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_RENDER_BASE_URL ??
    MAP_STYLE_RENDER_BASE_URL
  const server = await ensureRenderServer(baseUrl)
  const entries: Record<string, MapRenderManifestEntry> = {}
  const browser = await chromium.launch({
    headless: true,
  })
  const stage = options.stage ?? 'local'
  const force = options.force ?? false

  try {
    for (const [index, job] of jobs.entries()) {
      const isCurrent =
        !force &&
        !!options.remoteConfig &&
        (await doesRemoteRenderExist({
          stage,
          objectKey: job.targetObjectKey,
          remoteConfig: options.remoteConfig,
        }))

      options.onProgress?.({
        job,
        index: index + 1,
        total: jobs.length,
        stage: 'started',
      })

      if (isCurrent) {
        entries[job.targetObjectKey] = {
          fileName: job.targetObjectKey.split('/').pop() ?? `${job.hash}.png`,
          publicPath: `/${job.targetObjectKey}`,
          objectKey: job.targetObjectKey,
          publicUrl:
            stage === 'local'
              ? getLocalRenderAssetPath(job)
              : resolveMapRenderAssetUrl(
                  stage,
                  {
                    kind: job.kind,
                    identifier: job.identifier,
                    hash: job.hash,
                  },
                  `/${job.targetObjectKey}`,
                ),
          hash: job.hash,
          sourceUrl: job.sourceUrl,
        }
      } else {
        entries[job.targetObjectKey] = await renderMapRenderJobLocally(job, {
          browser,
          stage,
          remoteConfig: options.remoteConfig,
        })
      }

      options.onProgress?.({
        job,
        index: index + 1,
        total: jobs.length,
        stage: 'completed',
        entry: entries[job.targetObjectKey],
      })
    }

    return entries
  } finally {
    await browser.close()
    await server.dispose()
  }
}
