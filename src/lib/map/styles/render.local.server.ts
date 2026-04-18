import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { AwsClient } from 'aws4fetch'
import sharp from 'sharp'

import type {
  MapRenderManifestEntry,
  MapRenderRemoteConfig,
  PreviewStage,
} from '../../types'
import { buildMapStyleArtifacts } from './build'
import { getMapStyleAssetRecord, type MapStyleKey } from './registry'
import {
  MAP_STYLE_RENDER_BASE_URL,
  MAP_STYLE_RENDER_CAPTURE_SIZE,
  MAP_STYLE_RENDER_OUTPUT_SIZE,
  MAP_STYLE_RENDER_READY_SELECTOR,
  MAP_STYLE_RENDER_VIEW,
  getMapStyleRenderLocalPath,
  getMapStyleRenderObjectKey,
  resolveMapStyleRenderUrl,
} from './render.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SERVER / BROWSER ORCHESTRATION
//    - ensureRenderServer
//    - renderMapStyleRender
//
// 2. LOCAL GENERATION API
//    - ensureMapStyleRenderGeneratedLocally
//    - triggerMapStyleRenderGenerationLocally
//    - isMapStyleRenderGenerationPendingLocally
//    - doesMapStyleRenderExistLocally
//    - generateAllMapStyleRendersLocally

const loadChromium = async () => {
  const loadModule = new Function('moduleId', 'return import(moduleId)') as (
    moduleId: string,
  ) => Promise<{ chromium: unknown }>
  const playwright = await loadModule(['@play', 'wright/test'].join(''))

  return playwright.chromium
}

const SERVER_START_TIMEOUT_MS = 45_000
const PREVIEW_READY_TIMEOUT_MS = 45_000
const PREVIEW_NAVIGATION_TIMEOUT_MS = 45_000
const PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS = 5_000
const RENDER_PUBLIC_BUCKET_BY_STAGE = {
  local: 'hype-assets-dev',
  preview: 'hype-assets-preview',
  production: 'hype-assets-prod',
} as const

const renderPromises = new Map<string, Promise<MapRenderManifestEntry>>()

type RenderMapStyleOptions = {
  baseUrl?: string
  ensureArtifacts?: boolean
  manageServer?: boolean
  browser?: Awaited<ReturnType<Awaited<ReturnType<typeof loadChromium>>['launch']>>
  force?: boolean
  storage?: 'local' | 'remote'
  stage?: PreviewStage
  remoteConfig?: MapRenderRemoteConfig
  onProgress?: (event: {
    styleCode: string
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
  remoteConfig: NonNullable<RenderMapStyleOptions['remoteConfig']>
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
  remoteConfig: NonNullable<RenderMapStyleOptions['remoteConfig']>
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

const ensureRenderServer = async (
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

const buildRenderUrl = (baseUrl: string, style: string): string => {
  const url = new URL(`/headless/map-style-render/${style}`, baseUrl)

  url.searchParams.set('lng', String(MAP_STYLE_RENDER_VIEW.lng))
  url.searchParams.set('lat', String(MAP_STYLE_RENDER_VIEW.lat))
  url.searchParams.set('zoom', String(MAP_STYLE_RENDER_VIEW.zoom))
  url.searchParams.set('bearing', String(MAP_STYLE_RENDER_VIEW.bearing))
  url.searchParams.set('pitch', String(MAP_STYLE_RENDER_VIEW.pitch))

  return url.toString()
}

const renderMapStyleRender = async (
  styleCode: string,
  options: RenderMapStyleOptions = {},
): Promise<MapRenderManifestEntry> => {
  const chromium = await loadChromium()
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_RENDER_BASE_URL ??
    MAP_STYLE_RENDER_BASE_URL
  const manageServer = options.manageServer ?? true
  const stage = options.stage ?? 'local'

  if (options.ensureArtifacts !== false) {
    await buildMapStyleArtifacts()
  }

  const server = manageServer
    ? await ensureRenderServer(baseUrl)
    : { dispose: () => undefined }
  const browser =
    options.browser ??
    (await chromium.launch({
      headless: true,
    }))
  const shouldCloseBrowser = !options.browser

  try {
    const page = await browser.newPage({
      viewport: MAP_STYLE_RENDER_CAPTURE_SIZE,
      deviceScaleFactor: 1,
    })
    const consoleMessages: string[] = []
    const requestFailures: string[] = []
    const responseFailures: string[] = []

    const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
    const sourceUrl = buildRenderUrl(baseUrl, styleCode)
    const tempPath = path.join('/tmp', `${styleCode}.capture.png`)
    const hash = asset.hash
    const objectKey = getMapStyleRenderObjectKey(styleCode, hash)
    const fileName = objectKey.split('/').pop() ?? `${hash}.png`
    const publicPath =
      stage === 'local' ? getMapStyleRenderLocalPath(styleCode) : `/${objectKey}`

    page.on('console', message => {
      if (message.type() !== 'error' && message.type() !== 'warning') {
        return
      }

      consoleMessages.push(`[${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', error => {
      consoleMessages.push(`[pageerror] ${error.message}`)
    })
    page.on('requestfailed', request => {
      requestFailures.push(
        `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`,
      )
    })
    page.on('response', response => {
      if (response.status() < 400) {
        return
      }

      responseFailures.push(`${response.status()} ${response.url()}`)
    })

    try {
      await page.goto(sourceUrl, {
        waitUntil: 'load',
        timeout: PREVIEW_NAVIGATION_TIMEOUT_MS,
      })

      await page.waitForSelector(MAP_STYLE_RENDER_READY_SELECTOR, {
        timeout: PREVIEW_READY_TIMEOUT_MS,
      })
    } catch (error) {
      const readyState = await page
        .evaluate(() => {
          const signal = document.querySelector('#map-style-render-ready')

          return {
            dataReady:
              signal instanceof HTMLElement ? (signal.dataset.ready ?? null) : null,
            bodyClassName: document.body.className,
            bodyChildCount: document.body.childElementCount,
            title: document.title,
            href: window.location.href,
            appReady:
              (window as Window & { __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean })
                .__HYPE_MAP_STYLE_PREVIEW_READY__ ?? false,
          }
        })
        .catch(() => null)

      console.error('[map:styles:render] Failed while rendering map style preview', {
        styleCode,
        sourceUrl,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
        readyState,
        consoleMessages,
        requestFailures,
        responseFailures,
      })

      console.warn(
        `[map:styles:render] Falling back to a fixed settle delay for ${styleCode} (${PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS}ms)`,
      )
      await page.waitForTimeout(PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS)
    }

    await page.screenshot({
      path: tempPath,
    })

    const resizedBuffer = await sharp(tempPath)
      .resize(MAP_STYLE_RENDER_OUTPUT_SIZE.width, MAP_STYLE_RENDER_OUTPUT_SIZE.height, {
        fit: 'cover',
      })
      .png()
      .toBuffer()

    if (!options.remoteConfig) {
      throw new Error('Map render persistence requires remoteConfig')
    }
    await persistRemoteRender({
      stage,
      objectKey,
      contentType: 'image/png',
      body: resizedBuffer.buffer.slice(
        resizedBuffer.byteOffset,
        resizedBuffer.byteOffset + resizedBuffer.byteLength,
      ),
      remoteConfig: options.remoteConfig,
    })
    await rm(tempPath, { force: true })

    const entry: MapRenderManifestEntry = {
      fileName,
      publicPath,
      objectKey,
      publicUrl:
        stage === 'local'
          ? `${baseUrl.replace(/\/$/, '')}${publicPath}`
          : resolveMapStyleRenderUrl(stage, styleCode, hash),
      hash,
      sourceUrl,
    }

    return entry
  } finally {
    const pages = browser.contexts().flatMap(context => context.pages())
    await Promise.all(pages.map(page => page.close().catch(() => undefined)))
    if (shouldCloseBrowser) {
      await browser.close()
    }
    await server.dispose()
  }
}

/**
 * Kicks off local preview generation for one style and de-duplicates concurrent runs.
 *
 * @param styleCode Map style code to render.
 * @param options Local render options.
 * @returns Manifest entry for the generated preview.
 */
export const ensureMapStyleRenderGeneratedLocally = async (
  styleCode: string,
  options: RenderMapStyleOptions = {},
): Promise<MapRenderManifestEntry> => {
  const existing = renderPromises.get(styleCode)
  if (existing) {
    return existing
  }

  const promise = renderMapStyleRender(styleCode, options).finally(() => {
    renderPromises.delete(styleCode)
  })

  renderPromises.set(styleCode, promise)

  return promise
}

/**
 * Schedules local preview generation for one style without blocking the request/response cycle.
 *
 * @param styleCode Map style code to render.
 * @param options Local render options.
 * @returns Whether a new render was started.
 */
export const triggerMapStyleRenderGenerationLocally = (
  styleCode: string,
  options: RenderMapStyleOptions = {},
): boolean => {
  if (renderPromises.has(styleCode)) {
    return false
  }

  void ensureMapStyleRenderGeneratedLocally(styleCode, options).catch(error => {
    console.error('Failed to generate local map style preview', {
      styleCode,
      error,
    })
  })

  return true
}

/**
 * Returns whether a local style map render is currently in flight.
 *
 * @param styleCode Map style code.
 * @returns Whether a local render is running.
 */
export const isMapStyleRenderGenerationPendingLocally = (styleCode: string): boolean =>
  renderPromises.has(styleCode)

/**
 * Returns whether the local render image already exists on disk.
 *
 * @param styleCode Map style code.
 * @returns Whether the local preview file exists.
 */
export const doesMapStyleRenderExistLocally = async (
  styleCode: string,
  options: {
    remoteConfig: MapRenderRemoteConfig
    stage?: PreviewStage
  },
): Promise<boolean> => {
  try {
    const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
    return await doesRemoteRenderExist({
      stage: options.stage ?? 'local',
      objectKey: getMapStyleRenderObjectKey(styleCode, asset.hash),
      remoteConfig: options.remoteConfig,
    })
  } catch {
    return false
  }
}

/**
 * Generates previews for every registered map style locally.
 *
 * @param styleCodes Style codes to render.
 * @param options Local render options.
 * @returns Manifest entries keyed by style code.
 */
export const generateAllMapStyleRendersLocally = async (
  styleCodes: string[],
  options: RenderMapStyleOptions = {},
): Promise<Record<string, MapRenderManifestEntry>> => {
  const chromium = await loadChromium()
  const force = options.force ?? false
  const stage = options.stage ?? 'local'
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_RENDER_BASE_URL ??
    MAP_STYLE_RENDER_BASE_URL

  if (options.ensureArtifacts !== false) {
    await buildMapStyleArtifacts()
  }

  const previews: Record<string, MapRenderManifestEntry> = {}
  const server = await ensureRenderServer(baseUrl)
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    for (const [index, styleCode] of styleCodes.entries()) {
      const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
      const isCurrent =
        !force &&
        !!options.remoteConfig &&
        (await doesRemoteRenderExist({
          stage,
          objectKey: getMapStyleRenderObjectKey(styleCode, asset.hash),
          remoteConfig: options.remoteConfig,
        }))

      options.onProgress?.({
        styleCode,
        index: index + 1,
        total: styleCodes.length,
        stage: 'started',
      })

      if (isCurrent) {
        previews[styleCode] = {
          fileName: `${styleCode}.png`,
          publicPath:
            stage === 'local'
              ? getMapStyleRenderLocalPath(styleCode)
              : `/${getMapStyleRenderObjectKey(styleCode, asset.hash)}`,
          objectKey: getMapStyleRenderObjectKey(styleCode, asset.hash),
          publicUrl:
            stage === 'local'
              ? `${baseUrl.replace(/\/$/, '')}${getMapStyleRenderLocalPath(styleCode)}`
              : resolveMapStyleRenderUrl(stage, styleCode, asset.hash),
          hash: asset.hash,
          sourceUrl: buildRenderUrl(baseUrl, styleCode),
        }
      } else {
        previews[styleCode] = await ensureMapStyleRenderGeneratedLocally(styleCode, {
          ...options,
          browser,
          manageServer: false,
          ensureArtifacts: false,
          stage,
        })
      }

      options.onProgress?.({
        styleCode,
        index: index + 1,
        total: styleCodes.length,
        stage: 'completed',
        entry: previews[styleCode],
      })
    }
  } finally {
    await browser.close()
    await server.dispose()
  }

  return previews
}
