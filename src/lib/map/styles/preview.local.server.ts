import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

import type { PreviewManifestEntry } from '$lib/types'
import { buildMapStyleArtifacts } from './build'
import { getMapStyleAssetRecord, type MapStyleKey } from './registry'
import { MAP_STYLE_PREVIEW_DIR, getMapStylePreviewFilePath } from './preview.server'
import {
  MAP_STYLE_PREVIEW_BASE_URL,
  MAP_STYLE_PREVIEW_CAPTURE_SIZE,
  MAP_STYLE_PREVIEW_OUTPUT_SIZE,
  MAP_STYLE_PREVIEW_READY_SELECTOR,
  MAP_STYLE_PREVIEW_VIEW,
  getMapStylePreviewObjectKey,
  getMapStylePreviewPublicPath,
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

const previewRenderPromises = new Map<string, Promise<PreviewManifestEntry>>()

type RenderMapStylePreviewOptions = {
  baseUrl?: string
  ensureArtifacts?: boolean
  manageServer?: boolean
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

  const server = Bun.spawn({
    cmd: ['bun', 'run', 'dev', '--', '--host', 'localhost', '--port', '5173'],
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  })

  await waitForServer(baseUrl)

  return {
    dispose: () => {
      server.kill()
    },
  }
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
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const page = await browser.newPage({
      viewport: MAP_STYLE_PREVIEW_CAPTURE_SIZE,
      deviceScaleFactor: 1,
    })

    const asset = await getMapStyleAssetRecord(styleCode as MapStyleKey)
    const sourceUrl = buildPreviewUrl(baseUrl, styleCode)
    const tempPath = path.join(MAP_STYLE_PREVIEW_DIR, `${styleCode}.capture.png`)
    const hash = asset.hash
    const objectKey = getMapStylePreviewObjectKey(styleCode, hash)
    const fileName = objectKey.split('/').pop() ?? `${hash}.png`
    const publicPath = getMapStylePreviewPublicPath(styleCode, hash)
    const outputPath = getMapStylePreviewFilePath(styleCode, hash)

    await mkdir(MAP_STYLE_PREVIEW_DIR, { recursive: true })

    await page.goto(sourceUrl, {
      waitUntil: 'networkidle',
    })

    await page.waitForSelector(MAP_STYLE_PREVIEW_READY_SELECTOR, {
      timeout: PREVIEW_READY_TIMEOUT_MS,
    })

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
    await browser.close()
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
    await access(getMapStylePreviewFilePath(styleCode, asset.hash))
    return true
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
  if (options.ensureArtifacts !== false) {
    await buildMapStyleArtifacts()
  }

  await rm(MAP_STYLE_PREVIEW_DIR, { recursive: true, force: true })

  const previews: Record<string, PreviewManifestEntry> = {}

  for (const styleCode of styleCodes) {
    previews[styleCode] = await ensureMapStylePreviewGeneratedLocally(styleCode, {
      ...options,
      ensureArtifacts: false,
    })
  }

  return previews
}
