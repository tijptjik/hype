const GOOGLE_AVATAR_HOST_PATTERN = /(^|\.)googleusercontent\.com$/

function isGoogleAvatarHost(hostname: string): boolean {
  return GOOGLE_AVATAR_HOST_PATTERN.test(hostname.toLowerCase())
}

/**
 * Returns a same-origin avatar URL when the source is a Google-hosted avatar,
 * avoiding OpaqueResponseBlocking issues in the browser.
 */
export function resolveAvatarImageSrc(value: string | null | undefined): string | null {
  if (!value) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return value
  }

  if (parsed.protocol !== 'https:') return value
  if (!isGoogleAvatarHost(parsed.hostname)) return value

  const encoded = encodeURIComponent(parsed.toString())
  return `/api/proxy/avatar?url=${encoded}`
}
