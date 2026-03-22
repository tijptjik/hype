import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

// TYPES
import type { PreviewManifestEntry, PreviewRenderJob } from '../../types'
// HELPERS
import {
  MAP_STYLE_PREVIEW_BASE_URL,
  MAP_STYLE_PREVIEW_CAPTURE_SIZE,
  MAP_STYLE_PREVIEW_OUTPUT_SIZE,
  MAP_STYLE_PREVIEW_READY_SELECTOR,
} from '../styles/preview.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SERVER ORCHESTRATION
//    - ensurePreviewServer
//
// 2. LOCAL RENDERING
//    - renderPreviewJobLocally
//    - generatePreviewJobsLocally

const SERVER_START_TIMEOUT_MS = 45_000
const PREVIEW_READY_TIMEOUT_MS = 45_000
const LOCAL_PREVIEW_ROOT_DIR = path.join(os.tmpdir(), 'hype-map-previews')
const MAP_ENTITY_PREVIEW_SIZE = {
  width: 512,
  height: 512,
} as const

type GeneratePreviewJobsLocallyOptions = {
  baseUrl?: string
  browser?: Awaited<ReturnType<typeof chromium.launch>>
  onProgress?: (event: {
    job: PreviewRenderJob
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

/**
 * Ensures a local preview server is reachable, starting `bun run dev` when needed.
 *
 * @param baseUrl Local app origin to verify.
 * @returns Disposable handle for the spawned server, if any.
 */
export const ensurePreviewServer = async (
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

export const getLocalPreviewFilePath = (job: PreviewRenderJob): string =>
  path.join(LOCAL_PREVIEW_ROOT_DIR, job.targetObjectKey)

const getPreviewViewport = (
  job: PreviewRenderJob,
): { width: number; height: number } =>
  job.kind === 'styles' ? MAP_STYLE_PREVIEW_CAPTURE_SIZE : MAP_ENTITY_PREVIEW_SIZE

const getPreviewOutputSize = (
  job: PreviewRenderJob,
): { width: number; height: number } =>
  job.kind === 'styles' ? MAP_STYLE_PREVIEW_OUTPUT_SIZE : MAP_ENTITY_PREVIEW_SIZE

/**
 * Renders one preview job locally and stores the image under `/tmp/hype-map-previews/...`.
 *
 * @param job Queue-compatible preview render job.
 * @returns Manifest entry for the rendered image.
 */
export const renderPreviewJobLocally = async (
  job: PreviewRenderJob,
  options: {
    browser?: Awaited<ReturnType<typeof chromium.launch>>
  } = {},
): Promise<PreviewManifestEntry> => {
  const browser =
    options.browser ??
    (await chromium.launch({
      headless: true,
    }))
  const shouldCloseBrowser = !options.browser
  const fileName = job.targetObjectKey.split('/').pop() ?? `${job.hash}.png`
  const tempPath = path.join(
    LOCAL_PREVIEW_ROOT_DIR,
    `${job.kind}-${job.identifier}.capture.png`,
  )
  const outputPath = getLocalPreviewFilePath(job)

  try {
    const page = await browser.newPage({
      viewport: getPreviewViewport(job),
      deviceScaleFactor: 1,
    })

    await mkdir(path.dirname(outputPath), { recursive: true })

    await page.goto(job.sourceUrl, {
      waitUntil: 'load',
    })

    await page.waitForSelector(MAP_STYLE_PREVIEW_READY_SELECTOR, {
      timeout: PREVIEW_READY_TIMEOUT_MS,
    })

    await page.screenshot({
      path: tempPath,
    })

    const resizedBuffer = await sharp(tempPath)
      .resize(getPreviewOutputSize(job).width, getPreviewOutputSize(job).height, {
        fit: 'cover',
      })
      .png()
      .toBuffer()

    await writeFile(outputPath, resizedBuffer)
    await rm(tempPath, { force: true })

    return {
      fileName,
      publicPath: `/${job.targetObjectKey}`,
      objectKey: job.targetObjectKey,
      publicUrl: outputPath,
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
 * @param jobs Queue-compatible preview render jobs.
 * @param options Local render options.
 * @returns Manifest entries keyed by object key.
 */
export const generatePreviewJobsLocally = async (
  jobs: PreviewRenderJob[],
  options: GeneratePreviewJobsLocallyOptions = {},
): Promise<Record<string, PreviewManifestEntry>> => {
  const baseUrl =
    options.baseUrl ??
    process.env.MAP_STYLE_PREVIEW_BASE_URL ??
    MAP_STYLE_PREVIEW_BASE_URL
  const server = await ensurePreviewServer(baseUrl)
  const entries: Record<string, PreviewManifestEntry> = {}
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    for (const [index, job] of jobs.entries()) {
      options.onProgress?.({
        job,
        index: index + 1,
        total: jobs.length,
        stage: 'started',
      })

      entries[job.targetObjectKey] = await renderPreviewJobLocally(job, {
        browser,
      })

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
