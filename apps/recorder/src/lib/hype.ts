// TAURI
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'

const origin =
  import.meta.env.VITE_RECORDER_DEBUG === 'true'
    ? 'https://fi.tailb49776.ts.net:9443'
    : 'https://hype.hk'
const clientId = 'hk.hype.recorder'

/**
 * Bounds the full request, including a server that accepts TCP but never replies.
 * @param signal - Optional cancellation when the contributor abandons sign-in.
 * @returns A signal shared by native transport and response body reads.
 */
function requestDeadline(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(15000)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export const connectionHint =
  import.meta.env.VITE_RECORDER_DEBUG === 'true'
    ? 'Could not reach HYPE on Fi. Check Tailscale and try again.'
    : 'Could not reach HYPE. Check your connection and try again.'

/**
 * Forwards SvelteKit's generated requests from the local bundle to the HYPE runtime.
 * @returns Nothing. Other local assets keep their original fetch implementation.
 */
export function installRemoteTransport(): void {
  const fetchAsset = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href)
    const mapRelease =
      /^\/api\/premises-maps\/[a-z0-9-]+\/releases\/[a-f0-9]{64}$/.test(url.pathname)
    if (
      url.origin !== location.origin ||
      (!mapRelease && !url.pathname.startsWith('/_app/remote/'))
    ) {
      return fetchAsset(input, init)
    }
    const request = new Request(input instanceof Request ? input : url, init)
    const headers = new Headers(request.headers)
    headers.set('origin', origin)
    return nativeFetch(origin + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.body ? await request.arrayBuffer() : undefined,
      signal: mapRelease
        ? AbortSignal.any([request.signal, AbortSignal.timeout(60000)])
        : requestDeadline(request.signal),
      maxRedirections: 0,
    })
  }
}

async function authRequest(
  path: string,
  body: Record<string, string>,
  signal?: AbortSignal,
) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-hype-recorder': '1',
    origin,
  })
  return nativeFetch(origin + '/api/auth/' + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: requestDeadline(signal),
    maxRedirections: 0,
  })
}

/**
 * Opens HYPE's account approval page and redeems the single-use device grant.
 * @param showCode - Displays the browser comparison code in Recorder.
 * @param signal - Cancels an abandoned or superseded sign-in.
 * @returns Once HYPE issues the device session.
 */
export async function connect(
  showCode: (code: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await authRequest(
    'device/code',
    { client_id: clientId },
    signal,
  ).catch(() => {
    throw new Error(connectionHint)
  })
  if (!response.ok) throw new Error('Could not start sign-in. Try again.')
  const grant = await response.json()
  showCode(grant.user_code)
  const expires = Date.now() + grant.expires_in * 1000
  let interval = grant.interval * 1000
  await openUrl(
    origin + '/recorder/connect?user_code=' + encodeURIComponent(grant.user_code),
  )

  // A pending grant and a polling slowdown are both retryable until expiry.
  while (Date.now() < expires) {
    await new Promise(resolve => setTimeout(resolve, interval))
    signal.throwIfAborted()
    const result = await authRequest(
      'device/token',
      {
        client_id: clientId,
        device_code: grant.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      signal,
    )
    const data = await result.json()
    if (result.ok && typeof data.access_token === 'string') {
      signal.throwIfAborted()
      return
    }
    if (data.error === 'slow_down') interval += 5000
    else if (data.error !== 'authorization_pending') {
      throw new Error(
        data.error === 'access_denied'
          ? 'Connection declined.'
          : 'Sign-in expired. Try again.',
      )
    }
  }
  throw new Error('Sign-in expired. Try again.')
}

/** @returns Once HYPE revokes this device session. */
export async function disconnect(): Promise<void> {
  const response = await authRequest('sign-out', {})
  if (!response.ok)
    throw new Error('Could not sign out. Check your connection and try again.')
}
