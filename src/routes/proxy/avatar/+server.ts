import type { RequestHandler } from './$types'

const GOOGLE_AVATAR_HOST_PATTERN = /(^|\.)googleusercontent\.com$/

function isAllowedAvatarHost(hostname: string): boolean {
  return GOOGLE_AVATAR_HOST_PATTERN.test(hostname.toLowerCase())
}

export const GET: RequestHandler = async ({ url }) => {
  const targetParam = url.searchParams.get('url')
  if (!targetParam) {
    return new Response('Missing url parameter', { status: 400 })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(targetParam)
  } catch {
    return new Response('Invalid url parameter', { status: 400 })
  }

  if (targetUrl.protocol !== 'https:') {
    return new Response('Invalid url protocol', { status: 400 })
  }

  if (!isAllowedAvatarHost(targetUrl.hostname)) {
    return new Response('Avatar host not allowed', { status: 403 })
  }

  try {
    const upstream = await globalThis.fetch(targetUrl.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })

    if (!upstream.ok) {
      return new Response('Avatar not available', { status: upstream.status })
    }

    const upstreamContentType = upstream.headers.get('content-type')
    const contentType = upstreamContentType?.toLowerCase() ?? ''

    if (!contentType.startsWith('image/')) {
      return new Response('Invalid avatar response type', { status: 415 })
    }

    const cacheControl =
      upstream.headers.get('cache-control') ??
      'public, max-age=3600, stale-while-revalidate=86400'

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstreamContentType ?? 'application/octet-stream',
        'Cache-Control': cacheControl,
      },
    })
  } catch {
    return new Response('Failed to fetch avatar', { status: 502 })
  }
}
