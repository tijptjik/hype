/**
 * Decode a Place form JSON envelope without turning malformed input into an empty edit.
 * @param value Form control text or an already decoded object.
 * @returns The parsed envelope, or the original input for normal validation failure.
 */
export function decodePlaceFormValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
