// TAURI
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'
// TYPES
import type { RecorderEditor } from '../../../../src/lib/fieldResearch/recorderEditor'
import { recorderPhotoThumbnailTransform } from '../../../../src/lib/fieldResearch/recorderPhotos'
import type { PendingPhoto } from './recordDraft'
// I18N
import { t } from './i18n'

const origin =
  import.meta.env.VITE_RECORDER_DEBUG === 'true'
    ? 'https://fi.tailb49776.ts.net:9443'
    : 'https://hype.hk'
export { origin as recorderOrigin }
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
    ? t('could_not_reach_hype_on_fi_check_tailscale_and_try_again')
    : t('could_not_reach_hype_check_your_connection_and_try_again')

/**
 * Forwards SvelteKit's generated requests from the local bundle to the HYPE runtime.
 * @returns Nothing. Other local assets keep their original fetch implementation.
 */
export function installRemoteTransport(): void {
  const fetchAsset = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href)
    const modelFile =
      /^\/api\/location-exterior\/[^/]+\/[a-f0-9-]{36}\/(?:placement\.json|comparison-[0-9a-f]{64}\.glb|[a-zA-Z0-9_.-]+\.(?:gltf|bin|jpe?g|png))$/i.test(
        url.pathname,
      )
    const mapRelease =
      /^\/api\/premises-maps\/[a-z0-9-]+\/releases\/[a-f0-9]{64}$/.test(url.pathname)
    if (
      url.origin !== location.origin ||
      (!modelFile && !mapRelease && !url.pathname.startsWith('/_app/remote/'))
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
      signal:
        modelFile || mapRelease
          ? AbortSignal.any([request.signal, AbortSignal.timeout(60000)])
          : requestDeadline(request.signal),
      maxRedirections: 0,
    })
  }
}

/** @param revision Immutable gallery image revision. @returns Target environment's thumbnail URL. */
export function photoThumbnail(revision: string): string {
  return (
    origin +
    '/api/images/revisions/' +
    encodeURIComponent(revision) +
    '?t=' +
    recorderPhotoThumbnailTransform
  )
}

/** Retry the same saved revision at original size if its thumbnail cannot be displayed.
 * @param image Gallery image whose request failed. @returns After at most one fallback per revision.
 */
export function retryOriginal(image: Element): void {
  if (!(image instanceof HTMLImageElement)) return
  const source = new URL(image.src)
  if (source.searchParams.has('t')) {
    source.searchParams.delete('t')
    image.src = source.href
  }
}

/** @param recordId Editable record. @param photo Selected capture with a stable retry ID.
 * @returns Editor with the acknowledged gallery revision.
 */
export async function uploadRecorderPhoto(
  recordId: string,
  photo: PendingPhoto,
): Promise<RecorderEditor> {
  const url = new URL(
    '/api/recorder/records/' + encodeURIComponent(recordId) + '/photos/' + photo.id,
    origin,
  )
  url.searchParams.set('filename', photo.file.name)
  const response = await nativeFetch(url.href, {
    method: 'PUT',
    headers: {
      origin,
      'content-type': photo.file.type,
      'x-photo-size': String(photo.file.size),
    },
    body: photo.file,
    signal: AbortSignal.timeout(120000),
    maxRedirections: 0,
  })
  if (!response.ok) throw new Error(t('photo_save_failed'))
  return response.json()
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
  if (!response.ok) throw new Error(t('could_not_start_sign_in_try_again'))
  const grant = await response.json()
  showCode(grant.user_code)
  const expires = Date.now() + grant.expires_in * 1000
  let interval = grant.interval * 1000
  await openUrl(
    origin + '/recorder/connect?user_code=' + encodeURIComponent(grant.user_code),
  )

  // Android can suspend WebView networking while the approval browser is in front.
  // Wait for Recorder to be visible before consuming the single-use grant.
  while (Date.now() < expires) {
    const delay = Math.min(interval, expires - Date.now())
    await new Promise(resolve => setTimeout(resolve, delay))
    signal.throwIfAborted()
    if (Date.now() >= expires) break
    if (document.hidden) continue
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
    // A pending grant and a polling slowdown are both retryable until expiry.
    if (data.error === 'slow_down') interval += 5000
    else if (data.error !== 'authorization_pending') {
      throw new Error(
        data.error === 'access_denied'
          ? t('connection_declined')
          : t('sign_in_expired_try_again'),
      )
    }
  }
  throw new Error(t('sign_in_expired_try_again'))
}

/** @returns Once HYPE revokes this device session. */
export async function disconnect(): Promise<void> {
  const response = await authRequest('sign-out', {})
  if (!response.ok)
    throw new Error(t('could_not_sign_out_check_your_connection_and_try_again'))
}
