type Env = {
  ENVIRONMENT: 'preview' | 'production'
  IMAGE_SERVICE_ORIGIN: string
  PUBLIC_ASSETS: R2Bucket
}

const CACHE_CONTROL_FALLBACK = 'public, max-age=31536000, immutable'
const MAP_PREVIEW_PREFIX = '/mapPreviews/'

/**
 * Routes public asset traffic between static R2-backed assets and the image worker.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @returns Asset response for the requested path.
 */
const handleFetch = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return Response.json({
      ok: true,
      environment: env.ENVIRONMENT,
      imageServiceOrigin: env.IMAGE_SERVICE_ORIGIN,
    })
  }

  if (url.pathname.startsWith(MAP_PREVIEW_PREFIX)) {
    return servePublicAsset(request, env.PUBLIC_ASSETS, url.pathname)
  }

  if (isImageServicePath(url.pathname)) {
    return proxyToImageService(request, env.IMAGE_SERVICE_ORIGIN)
  }

  return new Response('Not found', { status: 404 })
}

/**
 * Checks whether the request path targets the image service contract.
 *
 * @param pathname Request pathname.
 * @returns Whether the path should be proxied to the image worker.
 */
const isImageServicePath = (pathname: string): boolean => {
  const segments = pathname.split('/').filter(Boolean)
  return (
    segments.length >= 3 &&
    (segments[0] === 'preview' ||
      segments[0] === 'production' ||
      segments[0] === 'local') &&
    segments[1] === 'image'
  )
}

/**
 * Proxies one request to the dedicated image worker origin unchanged.
 *
 * @param request Incoming request.
 * @param imageServiceOrigin Public origin for the image worker.
 * @returns Proxied image worker response.
 */
const proxyToImageService = (
  request: Request,
  imageServiceOrigin: string,
): Promise<Response> => {
  const targetUrl = new URL(request.url)
  const originUrl = new URL(imageServiceOrigin)
  targetUrl.protocol = originUrl.protocol
  targetUrl.host = originUrl.host

  return fetch(new Request(targetUrl.toString(), request))
}

/**
 * Reads one immutable public asset from R2 and returns its stored metadata.
 *
 * @param request Incoming request.
 * @param bucket Public assets bucket for the current environment.
 * @param pathname Request pathname.
 * @returns Stored object response or `404`.
 */
const servePublicAsset = async (
  request: Request,
  bucket: R2Bucket,
  pathname: string,
): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const objectKey = pathname.replace(/^\/+/, '')
  const object = await bucket.get(objectKey)
  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers: {
      'cache-control': object.httpMetadata?.cacheControl ?? CACHE_CONTROL_FALLBACK,
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: object.httpEtag,
    },
  })
}

export default {
  fetch: handleFetch,
}
