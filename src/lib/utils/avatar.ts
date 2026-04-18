export function resolveAvatarImageSrc(value: string | null | undefined): string | null {
  if (!value) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return value
  }

  if (parsed.protocol !== 'https:') return value
  if (!/(^|\.)googleusercontent\.com$/i.test(parsed.hostname)) return value

  return `/proxy/avatar?url=${encodeURIComponent(parsed.toString())}`
}
