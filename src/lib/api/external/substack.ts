type SubscribeFn = (email: string, substackUrl: string) => Promise<unknown>

/**
 * Normalizes hub-configured Substack identifiers into a publication URL.
 *
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @returns Canonical Substack URL string.
 */
export function toSubstackPublicationUrl(subscriptionId: string): string {
  const normalized = subscriptionId.trim()

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
 * Subscribes an email address to a Substack publication using the installed provider adapter.
 *
 * @param email - Target subscriber email address.
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @returns Provider response payload.
 * @remarks
 * `substack-subscriber` is an unofficial Playwright-based adapter rather than a
 * stable public Substack API client, so callers should treat failures as provider
 * integration failures rather than permanent business-rule failures.
 */
export async function subscribeToSubstack(
  email: string,
  subscriptionId: string,
): Promise<unknown> {
  const mod = (await import('substack-subscriber')) as {
    subscribe?: SubscribeFn
    default?: { subscribe?: SubscribeFn }
  }
  const subscribe = mod.subscribe ?? mod.default?.subscribe

  if (typeof subscribe !== 'function') {
    throw new Error('SUBSTACK_SUBSCRIBER_NOT_AVAILABLE')
  }

  return subscribe(email, toSubstackPublicationUrl(subscriptionId))
}
