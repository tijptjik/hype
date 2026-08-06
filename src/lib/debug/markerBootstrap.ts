const MARKER_BOOTSTRAP_DEBUG_PARAM = 'markerDebug'
const MARKER_BOOTSTRAP_DEBUG_STORAGE_KEY = 'hype:marker-bootstrap-debug'

/**
 * Determines whether temporary guest-to-map diagnostics are enabled.
 *
 * @returns Whether marker bootstrap diagnostics should be written to the browser console.
 * @remarks Add `?markerDebug=1` to any app URL once. The preference survives the
 * sign-out and sign-in redirects in session storage until the browser tab closes.
 */
export function isMarkerBootstrapDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false

  const value = new URLSearchParams(window.location.search).get(
    MARKER_BOOTSTRAP_DEBUG_PARAM,
  )

  if (value === '0') {
    window.sessionStorage.removeItem(MARKER_BOOTSTRAP_DEBUG_STORAGE_KEY)
    return false
  }

  if (value === '1') {
    window.sessionStorage.setItem(MARKER_BOOTSTRAP_DEBUG_STORAGE_KEY, '1')
    return true
  }

  return window.sessionStorage.getItem(MARKER_BOOTSTRAP_DEBUG_STORAGE_KEY) === '1'
}

/**
 * Writes an opt-in marker-bootstrap diagnostic event.
 *
 * @param event Short lifecycle label for the event.
 * @param details Structured, non-sensitive diagnostic information.
 * @returns Nothing.
 */
export function logMarkerBootstrap(
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (!isMarkerBootstrapDebugEnabled()) return

  console.info(`[marker-bootstrap] ${event}`, {
    at: new Date().toISOString(),
    path: window.location.pathname,
    ...details,
  })
}
