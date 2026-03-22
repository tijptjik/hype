import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

import type { PreviewManifestEntry } from '../../types'
import { buildMapStyleArtifacts } from './build'
import { getMapStyleAssetRecord, type MapStyleKey } from './registry'
import {
  MAP_STYLE_PREVIEW_DIR,
  getMapStylePreviewFilePath,
  getMapStylePreviewManifestPath,
} from './preview.server'
import {
  MAP_STYLE_PREVIEW_BASE_URL,
  MAP_STYLE_PREVIEW_CAPTURE_SIZE,
  MAP_STYLE_PREVIEW_OUTPUT_SIZE,
  MAP_STYLE_PREVIEW_READY_SELECTOR,
  MAP_STYLE_PREVIEW_VIEW,
  getMapStylePreviewLocalPath,
  getMapStylePreviewObjectKey,
} from './preview.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SERVER / BROWSER ORCHESTRATION
//    - ensurePreviewServer
//    - renderMapStylePreview
//
// 2. LOCAL GENERATION API
//    - ensureMapStylePreviewGeneratedLocally
//    - triggerMapStylePreviewGenerationLocally
//    - isMapStylePreviewGenerationPendingLocally
//    - doesMapStylePreviewExistLocally
//    - generateAllMapStylePreviewsLocally

const SERVER_START_TIMEOUT_MS = 45_000
const PREVIEW_READY_TIMEOUT_MS = 45_000
const PREVIEW_NAVIGATION_TIMEOUT_MS = 45_000
const PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS = 5_000

const previewRenderPromises = new Map<string, Promise<PreviewManifestEntry>>()
type MapStylePreviewManifest = Record<string, { hash: string }>

type RenderMapStylePreviewOptions = {
  baseUrl?: string
  ensureArtifacts?: boolean
  manageServer?: boolean
  browser?: Awaited<ReturnType<typeof chromium.launch>>
  force?: boolean
  onProgress?: (event: {
    styleCode: string
    index: number
    total: number
    stage: 'started' | 'completed'
    entry?: PreviewManifestEntry
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

const ensurePreviewServer = async (
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

const readPreviewManifest = async (): Promise<MapStylePreviewManifest> => {
  try {
    return JSON.parse(
      await readFile(getMapStylePreviewManifestPath(), 'utf8'),
    ) as MapStylePreviewManifest
  } catch {
    return {}
  }
}

const writePreviewManifest = async (
  manifest: MapStylePreviewManifest,
): Promise<void> => {
  await mkdir(MAP_STYLE_PREVIEW_DIR, { recursive: true })
  await writeFile(
    getMapStylePreviewManifestPath(),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

const buildPreviewUrl = (baseUrl: string, style: string): string => {
  const url = new URL(`/headless/map-style-preview/${style}`, baseUrl)

  url.searchParams.set('lng', String(MAP_STYLE_PREVIEW_VIEW.lng))
  url.searchParams.set('lat', String(MAP_STYLE_PREVIEW_VIEW.lat))
  url.searchParams.set('zoom', String(MAP_STYLE_PREVIEW_VIEW.zoom))
  url.searchParams.set('bearing', String(MAP_STYLE_PREVIEW_VIEW.bearing))
  url.searchParams.set('pitch', String(MAP_STYLE_PREVIEW_VIEW.pitch))

  return url.toString()
}

const renderMapStylePreview = async (
  styleCode: string,
  options: RenderMapStylePreviewOptions = {},
): Promise<PreviewManifestEntry> => {
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_PREVIEW_BASE_URL ??
    MAP_STYLE_PREVIEW_BASE_URL
  const manageServer = options.manageServer ?? true

  if (options.ensureArtifacts !== false) {
    await buildMapStyleArtifacts()
  }

  const server = manageServer
    ? await ensurePreviewServer(baseUrl)
    : { dispose: () => undefined }
  const browser =
    options.browser ??
    (await chromium.launch({
      headless: true,
    }))
  const shouldCloseBrowser = !options.browser

  try {
    const page = await browser.newPage({
      viewport: MAP_STYLE_PREVIEW_CAPTURE_SIZE,
      deviceScaleFactor: 1,
    })
    const consoleMessages: string[] = []
    const requestFailures: string[] = []
    const responseFailures: string[] = []

    const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
    const sourceUrl = buildPreviewUrl(baseUrl, styleCode)
    const tempPath = path.join(MAP_STYLE_PREVIEW_DIR, `${styleCode}.capture.png`)
    const hash = asset.hash
    const objectKey = getMapStylePreviewObjectKey(styleCode, hash)
    const fileName = objectKey.split('/').pop() ?? `${hash}.png`
    const publicPath = getMapStylePreviewLocalPath(styleCode)
    const outputPath = getMapStylePreviewFilePath(styleCode)

    await mkdir(MAP_STYLE_PREVIEW_DIR, { recursive: true })

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

      await page.waitForSelector(MAP_STYLE_PREVIEW_READY_SELECTOR, {
        timeout: PREVIEW_READY_TIMEOUT_MS,
      })
    } catch (error) {
      const readyState = await page
        .evaluate(() => {
          const signal = document.querySelector('#map-style-preview-ready')

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

      console.error('[map:styles:preview] Failed while rendering map style preview', {
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
        `[map:styles:preview] Falling back to a fixed settle delay for ${styleCode} (${PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS}ms)`,
      )
      await page.waitForTimeout(PREVIEW_FALLBACK_SETTLE_TIMEOUT_MS)
    }

    await page.screenshot({
      path: tempPath,
    })

    const resizedBuffer = await sharp(tempPath)
      .resize(
        MAP_STYLE_PREVIEW_OUTPUT_SIZE.width,
        MAP_STYLE_PREVIEW_OUTPUT_SIZE.height,
        {
          fit: 'cover',
        },
      )
      .png()
      .toBuffer()

    // Store the preview under the same hash-addressed object key shape used by remote storage.
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, resizedBuffer)
    await rm(tempPath, { force: true })

    const entry: PreviewManifestEntry = {
      fileName,
      publicPath,
      objectKey,
      publicUrl: `${baseUrl.replace(/\/$/, '')}${publicPath}`,
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
export const ensureMapStylePreviewGeneratedLocally = async (
  styleCode: string,
  options: RenderMapStylePreviewOptions = {},
): Promise<PreviewManifestEntry> => {
  const existing = previewRenderPromises.get(styleCode)
  if (existing) {
    return existing
  }

  const promise = renderMapStylePreview(styleCode, options).finally(() => {
    previewRenderPromises.delete(styleCode)
  })

  previewRenderPromises.set(styleCode, promise)

  return promise
}

/**
 * Schedules local preview generation for one style without blocking the request/response cycle.
 *
 * @param styleCode Map style code to render.
 * @param options Local render options.
 * @returns Whether a new render was started.
 */
export const triggerMapStylePreviewGenerationLocally = (
  styleCode: string,
  options: RenderMapStylePreviewOptions = {},
): boolean => {
  if (previewRenderPromises.has(styleCode)) {
    return false
  }

  void ensureMapStylePreviewGeneratedLocally(styleCode, options).catch(error => {
    console.error('Failed to generate local map style preview', {
      styleCode,
      error,
    })
  })

  return true
}

/**
 * Returns whether a local style preview render is currently in flight.
 *
 * @param styleCode Map style code.
 * @returns Whether a local render is running.
 */
export const isMapStylePreviewGenerationPendingLocally = (styleCode: string): boolean =>
  previewRenderPromises.has(styleCode)

/**
 * Returns whether the local preview image already exists on disk.
 *
 * @param styleCode Map style code.
 * @returns Whether the local preview file exists.
 */
export const doesMapStylePreviewExistLocally = async (
  styleCode: string,
): Promise<boolean> => {
  try {
    const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
    await access(getMapStylePreviewFilePath(styleCode))
    const manifest = await readPreviewManifest()

    return manifest[styleCode]?.hash === asset.hash
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
export const generateAllMapStylePreviewsLocally = async (
  styleCodes: string[],
  options: RenderMapStylePreviewOptions = {},
): Promise<Record<string, PreviewManifestEntry>> => {
  const force = options.force ?? false
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_PREVIEW_BASE_URL ??
    MAP_STYLE_PREVIEW_BASE_URL

  if (options.ensureArtifacts !== false) {
    await buildMapStyleArtifacts()
  }

  if (force) {
    await rm(MAP_STYLE_PREVIEW_DIR, { recursive: true, force: true })
  }

  const manifest = force ? {} : await readPreviewManifest()
  const previews: Record<string, PreviewManifestEntry> = {}
  const server = await ensurePreviewServer(baseUrl)
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    for (const [index, styleCode] of styleCodes.entries()) {
      const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
      const previewExists = await access(getMapStylePreviewFilePath(styleCode))
        .then(() => true)
        .catch(() => false)
      const isCurrent =
        !force && previewExists && manifest[styleCode]?.hash === asset.hash

      options.onProgress?.({
        styleCode,
        index: index + 1,
        total: styleCodes.length,
        stage: 'started',
      })

      if (isCurrent) {
        previews[styleCode] = {
          fileName: `${styleCode}.png`,
          publicPath: getMapStylePreviewLocalPath(styleCode),
          objectKey: getMapStylePreviewObjectKey(styleCode, asset.hash),
          publicUrl: `${baseUrl.replace(/\/$/, '')}${getMapStylePreviewLocalPath(styleCode)}`,
          hash: asset.hash,
          sourceUrl: buildPreviewUrl(baseUrl, styleCode),
        }
      } else {
        previews[styleCode] = await ensureMapStylePreviewGeneratedLocally(styleCode, {
          ...options,
          browser,
          manageServer: false,
          ensureArtifacts: false,
        })
      }

      manifest[styleCode] = {
        hash: asset.hash,
      }

      options.onProgress?.({
        styleCode,
        index: index + 1,
        total: styleCodes.length,
        stage: 'completed',
        entry: previews[styleCode],
      })
    }

    await writePreviewManifest(manifest)
  } finally {
    await browser.close()
    await server.dispose()
  }

  return previews
}
