/** Extract a useful failure message from remote-form and transport errors.
 * @param cause The thrown submission error, including SvelteKit HttpError objects.
 * @returns The reported message, or a status-specific fallback without submitted data.
 */
export function submissionErrorMessage(cause: unknown): string | undefined {
  if (typeof cause === 'string') return cause.trim() || undefined
  if (!cause || typeof cause !== 'object') return undefined
  const error = cause as {
    message?: unknown
    body?: { message?: unknown }
    status?: unknown
  }
  for (const message of [error.body?.message, error.message])
    if (typeof message === 'string' && message.trim()) return message.trim()
  return typeof error.status === 'number'
    ? `Save failed (HTTP ${error.status}).`
    : undefined
}
