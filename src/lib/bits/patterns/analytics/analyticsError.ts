/**
 * Preserves the remote runtime's public error details instead of hiding the cause.
 * @param cause - Rejected remote query or browser transport error.
 * @returns A readable message with HTTP status and a recovery hint where known.
 * @remarks Only server-sanitized remote bodies are shown; arbitrary exception text
 * remains in the browser console rather than being rendered to the user.
 */
export function formatAnalyticsError(cause: unknown): string {
  const error = typeof cause === 'object' && cause !== null ? cause : {}
  const status =
    'status' in error && typeof error.status === 'number' ? error.status : null
  const body =
    'body' in error && typeof error.body === 'object' && error.body !== null
      ? error.body
      : null
  const message =
    body && 'message' in body && typeof body.message === 'string' ? body.message : null
  const detail = message || 'The analytics request could not be completed.'
  if (status === 401 || status === 403)
    return `${detail} (HTTP ${status}). Check your sign-in and analytics access, then retry.`
  if (status === 404)
    return `${detail} (HTTP 404). Reload the page to reconnect to the current app version.`
  if (status) return `${detail} (HTTP ${status}). Refresh to retry.`
  if (cause instanceof TypeError)
    return 'The analytics request could not reach the server. Check your connection and reload the page.'
  return `${detail} Reload the page and retry; the browser console contains the underlying error.`
}
