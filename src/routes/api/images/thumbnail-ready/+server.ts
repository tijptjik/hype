import { env as publicEnv } from '$env/dynamic/public'
import type { RequestHandler } from './$types'
import { toCloudflareImageWorkerPath } from '$lib/images/delivery'

const SSE_POLL_INTERVAL_MS = 400
const SSE_TIMEOUT_MS = 20_000
const THUMBNAIL_TRANSFORMATION = 'c_fill,h_256,w_256'
const THUMBNAIL_FORMAT = 'webp'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseVersion(input: string | null): number | null {
  if (!input) return null

  const parsed = Number.parseInt(input, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toSseEvent(event: string, payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
  )
}

function resolveAssetBaseUrl(params: {
  platformAssetBaseUrl?: string
  requestUrl: URL
}): string | null {
  const platformAssetBaseUrl = params.platformAssetBaseUrl?.trim()
  if (platformAssetBaseUrl) {
    return platformAssetBaseUrl
  }

  const runtimeRawAssetBaseUrl = publicEnv.PUBLIC_RAW_ASSET_BASE_URL?.trim()
  if (runtimeRawAssetBaseUrl) {
    return runtimeRawAssetBaseUrl
  }

  const runtimeAssetBaseUrl = publicEnv.PUBLIC_ASSET_BASE_URL?.trim()
  if (runtimeAssetBaseUrl) {
    return runtimeAssetBaseUrl
  }

  if (
    params.requestUrl.hostname === 'localhost' ||
    params.requestUrl.hostname === '127.0.0.1'
  ) {
    return `http://${params.requestUrl.hostname}:8788`
  }

  return null
}

/**
 * Streams a one-shot SSE notification once the warmed admin thumbnail exists.
 */
export const GET: RequestHandler = ({ url, platform, request, fetch }) => {
  const publicId = url.searchParams.get('publicId')?.trim()
  const version = parseVersion(url.searchParams.get('version'))
  const assetBaseUrl = resolveAssetBaseUrl({
    platformAssetBaseUrl: platform?.env.PUBLIC_ASSET_BASE_URL,
    requestUrl: url,
  })

  if (!publicId) {
    return new Response('Missing publicId', { status: 400 })
  }

  if (!assetBaseUrl) {
    return new Response('Asset base URL is unavailable', { status: 503 })
  }

  const thumbnailPath = toCloudflareImageWorkerPath({
    publicId,
    version,
    transformation: THUMBNAIL_TRANSFORMATION,
    gravity: 'auto',
    quality: 'auto',
    format: THUMBNAIL_FORMAT,
  })
  const thumbnailUrl = new URL(thumbnailPath, assetBaseUrl).toString()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let isClosed = false
      const enqueue = (chunk: Uint8Array): boolean => {
        if (isClosed || request.signal.aborted) return false

        try {
          controller.enqueue(chunk)
          return true
        } catch {
          isClosed = true
          return false
        }
      }
      const close = (): void => {
        if (isClosed) return
        isClosed = true

        try {
          controller.close()
        } catch {
          // A late abort can race with stream completion in local dev.
        }
      }
      const abortListener = (): void => {
        close()
      }

      request.signal.addEventListener('abort', abortListener)

      try {
        if (
          !enqueue(
            toSseEvent('open', {
              publicId,
              version,
            }),
          )
        ) {
          return
        }

        const startedAt = Date.now()

        while (!request.signal.aborted && Date.now() - startedAt < SSE_TIMEOUT_MS) {
          try {
            const response = await fetch(thumbnailUrl, {
              method: 'HEAD',
              headers: {
                accept: 'image/webp,image/*;q=0.9,*/*;q=0.8',
                'cache-control': 'no-cache',
              },
            })

            if (response.ok) {
              enqueue(
                toSseEvent('thumbnail-ready', {
                  publicId,
                  version,
                  thumbnailUrl,
                }),
              )
              close()
              return
            }
          } catch {
            // Ignore transient reachability issues and keep polling while the client waits.
          }

          if (!enqueue(new TextEncoder().encode(': keepalive\n\n'))) {
            return
          }
          await sleep(SSE_POLL_INTERVAL_MS)
        }

        if (!request.signal.aborted) {
          enqueue(
            toSseEvent('thumbnail-timeout', {
              publicId,
              version,
            }),
          )
          close()
        }
      } finally {
        request.signal.removeEventListener('abort', abortListener)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
