// TYPES
import type { PreviewRenderJob } from '../../../src/lib/types'

type Env = {
  ENVIRONMENT: string
  PREVIEW_PUBLIC_BASE_URL: string
  CLOUDFLARE_ACCOUNT_ID: string
  BROWSER_RENDERING_API_TOKEN: string
  PREVIEW_ASSETS: R2Bucket
}

const BROWSER_RENDERING_SCREENSHOT_URL = (accountId: string): string =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`

const MAP_PREVIEW_READY_SELECTOR = '#map-style-preview-ready[data-ready="true"]'

const MAP_PREVIEW_VIEWPORT = {
  width: 256,
  height: 256,
  deviceScaleFactor: 1,
} as const

const MAP_ENTITY_PREVIEW_VIEWPORT = {
  width: 512,
  height: 512,
  deviceScaleFactor: 1,
} as const

const SCREENSHOT_TIMEOUT_MS = 60_000

/**
 * Validates that a queue payload matches the preview render contract.
 *
 * @param value Queue message body.
 * @returns Whether the payload is a valid preview render job.
 */
const isPreviewRenderJob = (value: unknown): value is PreviewRenderJob => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const job = value as Record<string, unknown>

  return (
    (job.kind === 'styles' || job.kind === 'layers' || job.kind === 'projects') &&
    typeof job.identifier === 'string' &&
    typeof job.hash === 'string' &&
    typeof job.sourceUrl === 'string' &&
    typeof job.targetObjectKey === 'string'
  )
}

/**
 * Calls Cloudflare Browser Rendering's screenshot endpoint for a preview URL.
 *
 * @param env Worker environment bindings and secrets.
 * @param job Preview render job payload.
 * @returns PNG bytes returned by Browser Rendering.
 */
const renderPreview = async (env: Env, job: PreviewRenderJob): Promise<ArrayBuffer> => {
  const viewport =
    job.kind === 'styles' ? MAP_PREVIEW_VIEWPORT : MAP_ENTITY_PREVIEW_VIEWPORT
  const response = await fetch(
    BROWSER_RENDERING_SCREENSHOT_URL(env.CLOUDFLARE_ACCOUNT_ID),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.BROWSER_RENDERING_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: job.sourceUrl,
        viewport,
        gotoOptions: {
          waitUntil: 'load',
          timeout: SCREENSHOT_TIMEOUT_MS,
        },
        waitForSelector: MAP_PREVIEW_READY_SELECTOR,
        screenshotOptions: {
          type: 'png',
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      `Browser Rendering failed (${response.status} ${response.statusText}): ${await response.text()}`,
    )
  }

  return response.arrayBuffer()
}

/**
 * Persists a generated preview image to R2 using immutable cache semantics.
 *
 * @param env Worker environment bindings and secrets.
 * @param job Preview render job payload.
 * @param image PNG bytes to upload.
 * @returns Public URL for the stored preview object.
 */
const storePreview = async (
  env: Env,
  job: PreviewRenderJob,
  image: ArrayBuffer,
): Promise<string> => {
  const generatedAt = new Date().toISOString()

  await env.PREVIEW_ASSETS.put(job.targetObjectKey, image, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      kind: job.kind,
      identifier: job.identifier,
      hash: job.hash,
      sourceUrl: job.sourceUrl,
      generatedAt,
    },
  })

  return `${env.PREVIEW_PUBLIC_BASE_URL}/${job.targetObjectKey}`
}

/**
 * Executes the full preview render pipeline for one job.
 *
 * @param env Worker environment bindings and secrets.
 * @param job Preview render job payload.
 * @returns Public URL of the uploaded preview.
 */
const processPreviewRenderJob = async (
  env: Env,
  job: PreviewRenderJob,
): Promise<string> => {
  const image = await renderPreview(env, job)

  return storePreview(env, job, image)
}

export default {
  /**
   * Lightweight health endpoint for ad-hoc verification.
   *
   * @param request Incoming HTTP request.
   * @param env Worker environment bindings and secrets.
   * @returns JSON health response or manual render result.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        previewPublicBaseUrl: env.PREVIEW_PUBLIC_BASE_URL,
      })
    }

    if (request.method === 'POST' && url.pathname === '/render') {
      const payload = await request.json()

      if (!isPreviewRenderJob(payload)) {
        return Response.json(
          { error: 'Invalid preview render job payload.' },
          { status: 400 },
        )
      }

      const publicUrl = await processPreviewRenderJob(env, payload)

      return Response.json({
        ok: true,
        publicUrl,
        objectKey: payload.targetObjectKey,
      })
    }

    return new Response('Not found', { status: 404 })
  },

  /**
   * Queue consumer entry point for asynchronous preview rendering.
   *
   * @param batch Queue batch delivered by Cloudflare Queues.
   * @param env Worker environment bindings and secrets.
   * @returns Promise that resolves when the batch has been handled.
   */
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!isPreviewRenderJob(message.body)) {
        console.error('Discarding invalid preview render job payload.')
        message.ack()
        continue
      }

      try {
        const publicUrl = await processPreviewRenderJob(env, message.body)

        console.log(
          JSON.stringify({
            event: 'preview-rendered',
            kind: message.body.kind,
            identifier: message.body.identifier,
            objectKey: message.body.targetObjectKey,
            publicUrl,
          }),
        )

        message.ack()
      } catch (error) {
        console.error('Preview render failed', {
          error,
          job: message.body,
        })
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env>
