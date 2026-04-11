import { toSubstackPublicationUrl } from '$lib/api/external/substack.shared'
export {
  normalizeSubstackSessionCookie,
  normalizeSubstackSubscriptionId,
  toSubstackPublicationUrl,
} from '$lib/api/external/substack.shared'

type SubstackProviderError = {
  error: string
  details?: string
  status?: number
}

/**
 * Normalizes a Substack publication URL into an absolute origin without a
 * trailing slash so it can be used for API requests.
 *
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @returns Absolute publication origin.
 */
function toSubstackPublicationOrigin(subscriptionId: string): string {
  const publicationUrl = toSubstackPublicationUrl(subscriptionId).trim()
  const withProtocol =
    publicationUrl.startsWith('http://') || publicationUrl.startsWith('https://')
      ? publicationUrl
      : `https://${publicationUrl}`

  return withProtocol.replace(/\/+$/, '')
}

/**
 * Converts response `Set-Cookie` headers into a request `Cookie` header value.
 *
 * @param headers - Response headers returned from the bootstrap request.
 * @returns Serialized cookie header or `null` when no cookies were set.
 */
function toCookieHeader(headers: Headers): string | null {
  const getSetCookie = (
    headers as Headers & {
      getSetCookie?: () => string[]
      getAll?: (name: string) => string[]
    }
  ).getSetCookie

  const rawCookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(headers)
      : typeof (
            headers as Headers & {
              getAll?: (name: string) => string[]
            }
          ).getAll === 'function'
        ? (
            headers as Headers & {
              getAll: (name: string) => string[]
            }
          ).getAll('set-cookie')
        : (() => {
            const combined = headers.get('set-cookie')
            return combined ? combined.split(/,(?=[^;]+=)/) : []
          })()

  const cookiePairs = rawCookies
    .map(cookie => cookie.split(';', 1)[0]?.trim() ?? '')
    .filter(Boolean)

  return cookiePairs.length > 0 ? cookiePairs.join('; ') : null
}

/**
 * Parses a Substack response into either JSON, `null`, or a normalized provider error.
 *
 * @param response - Fetch response returned by a Substack endpoint.
 * @returns Parsed payload or provider error shape.
 */
async function parseSubstackResponse(
  response: Response,
): Promise<SubstackProviderError | unknown> {
  const responseText = await response.text()

  if (!response.ok) {
    return {
      error: `Error ${response.status}`,
      details: responseText,
      status: response.status,
    }
  }

  if (!responseText) {
    return null
  }

  try {
    return JSON.parse(responseText)
  } catch {
    return {
      error: 'INVALID_PROVIDER_RESPONSE',
      details: responseText,
    }
  }
}

/**
 * Posts to Substack's public subscribe endpoint after bootstrapping request cookies.
 *
 * @param publicationOrigin - Canonical Substack origin for the target publication.
 * @param subscribePageUrl - Publication subscribe page URL.
 * @param userAgent - User agent used for Substack compatibility.
 * @param email - Target subscriber email address.
 * @returns Provider response payload.
 */
async function subscribeViaPublicEndpoint(
  publicationOrigin: string,
  subscribePageUrl: string,
  userAgent: string,
  email: string,
): Promise<SubstackProviderError | unknown> {
  // Bootstrap the same origin session the browser signup flow relies on.
  const bootstrapResponse = await fetch(subscribePageUrl, {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'user-agent': userAgent,
    },
  })

  const cookieHeader = toCookieHeader(bootstrapResponse.headers)

  // Mirror the payload shape used by Substack's subscribe page to preserve compatibility.
  const response = await fetch(`${publicationOrigin}/api/v1/free`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: publicationOrigin,
      referer: subscribePageUrl,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      'user-agent': userAgent,
    },
    body: JSON.stringify({
      first_url: subscribePageUrl,
      first_referrer: '',
      current_url: subscribePageUrl,
      current_referrer: '',
      first_session_url: subscribePageUrl,
      first_session_referrer: '',
      referral_code: '',
      source: 'subscribe_page',
      referring_pub_id: '',
      additional_referring_pub_ids: '',
      email,
    }),
  })

  return parseSubstackResponse(response)
}

/**
 * Subscribes an email address to a Substack publication using Substack's
 * authenticated subscriber endpoint when a session token is available, falling
 * back to the public newsletter endpoint otherwise.
 *
 * @param email - Target subscriber email address.
 * @param subscriptionId - Hub-configured Substack identifier or URL.
 * @param sessionCookie - Authenticated Substack session cookie pair copied from the admin UI.
 * @returns Provider response payload.
 * @remarks
 * When `sessionCookie` is present this targets Substack's private
 * `POST /api/v1/subscriber/add` endpoint, which mirrors the authenticated
 * dashboard "add subscriber" action captured from the web app. The public
 * `/api/v1/free` flow remains as a compatibility fallback for non-admin contexts.
 */
export async function subscribeToSubstack(
  email: string,
  subscriptionId: string,
  sessionCookie?: string,
): Promise<unknown> {
  const publicationOrigin = toSubstackPublicationOrigin(subscriptionId)
  const subscribePageUrl = `${publicationOrigin}/subscribe`
  const subscriberAddPageUrl = `${publicationOrigin}/publish/subscribers/add`
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

  if (sessionCookie?.trim()) {
    const response = await fetch(`${publicationOrigin}/api/v1/subscriber/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'cache-control': 'no-cache',
        origin: publicationOrigin,
        pragma: 'no-cache',
        referer: subscriberAddPageUrl,
        cookie: sessionCookie.trim(),
        'user-agent': userAgent,
      },
      body: JSON.stringify({
        email,
        subscription: false,
        sendEmail: true,
      }),
    })

    const authenticatedResult = await parseSubstackResponse(response)
    const authenticatedError =
      authenticatedResult &&
      typeof authenticatedResult === 'object' &&
      'error' in authenticatedResult
        ? (authenticatedResult as SubstackProviderError)
        : null

    return authenticatedError ?? authenticatedResult
  }

  return subscribeViaPublicEndpoint(
    publicationOrigin,
    subscribePageUrl,
    userAgent,
    email,
  )
}
