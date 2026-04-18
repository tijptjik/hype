/**
 * Normalizes a submitted Substack identifier by trimming whitespace and
 * removing any leading `@` prefixes.
 *
 * @param subscriptionId - Raw hub-configured Substack identifier or URL.
 * @returns Normalized Substack identifier or URL.
 */
export function normalizeSubstackSubscriptionId(subscriptionId: string): string {
  return subscriptionId.trim().replace(/^@+/, '')
}

/**
 * Normalizes a pasted Substack session cookie into a single `name=value` pair.
 *
 * @param sessionCookie - Raw pasted cookie fragment, set-cookie header value, or pair.
 * @returns Serialized `name=value` cookie pair.
 */
export function normalizeSubstackSessionCookie(sessionCookie: string): string {
  const trimmed = sessionCookie.trim()

  if (!trimmed) return ''

  const [cookiePair = ''] = trimmed.split(';', 1)
  return cookiePair.trim()
}

/**
 * Normalizes hub-configured Substack identifiers into a publication URL.
 *
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @returns Canonical Substack URL string.
 */
export function toSubstackPublicationUrl(subscriptionId: string): string {
  const normalized = normalizeSubstackSubscriptionId(subscriptionId)

  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.includes('.')
  ) {
    return normalized
  }

  return `https://${normalized}.substack.com`
}

/**
 * Returns the canonical public subscribe page for a Substack publication.
 *
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @returns Canonical Substack subscribe URL.
 */
export function toSubstackSubscribeUrl(subscriptionId: string): string {
  return `${toSubstackPublicationUrl(subscriptionId).replace(/\/+$/, '')}/`
}
