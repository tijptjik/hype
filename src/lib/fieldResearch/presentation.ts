/** Arrange an expanded gallery with a centered single top photo for odd counts.
 * @param count Number of photos. @returns Gallery dimensions and photo offsets.
 * @remarks Galleries grow sideways after three rows.
 */
export function researchStackLayout(count: number): {
  width: number
  height: number
  positions: { x: number; y: number }[]
} {
  if (count < 1) return { width: 0, height: 0, positions: [] }
  const rows = Math.min(3, Math.ceil(count / 2))
  const odd = count % 2 === 1
  const columns =
    count === 1
      ? 1
      : 2 * Math.ceil((count - (odd ? 1 : 0)) / ((rows - (odd ? 1 : 0)) * 2))
  const width = columns * 70
  const positions = Array.from({ length: count }, (_, index) => {
    if (odd && index === 0) return { x: (width - 64) / 2, y: 0 }
    const offset = index - (odd ? 1 : 0)
    const remaining = count - (odd ? 1 : 0)
    const row = Math.floor(offset / columns)
    const rowCount = Math.min(columns, remaining - row * columns)
    return {
      x: (width - (rowCount * 70 - 6)) / 2 + (offset % columns) * 70,
      y: (row + (odd ? 1 : 0)) * 76,
    }
  })
  return {
    width,
    height: (Math.ceil((count - (odd ? 1 : 0)) / columns) + (odd ? 1 : 0)) * 76,
    positions,
  }
}

/** Extract a readable message from remote errors without exposing serialized envelopes.
 * @param cause Thrown remote error. @returns User-facing feedback.
 */
export function researchErrorMessage(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'body' in cause)
    return researchErrorMessage(cause.body)
  const value =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'object' && cause !== null && 'message' in cause
        ? cause.message
        : cause
  if (typeof value !== 'string') return 'Something went wrong. Please try again.'
  if (value === 'UNAUTHENTICATED')
    return 'Your sign-in could not be verified. Please try again or sign in again.'
  if (/JSON\.parse|Unexpected (?:token|end).*JSON|not valid JSON/i.test(value))
    return 'The server returned an unexpected response. Please try again.'
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null)
      return researchErrorMessage(parsed)
  } catch {
    // Plain server validation messages are already suitable for display.
  }
  return value.startsWith('{') || value === '[object Object]'
    ? 'Something went wrong. Please try again.'
    : value
}
