/** Preserve the public rejection returned by a profile save.
 * @param cause Remote HttpError or browser exception.
 * @returns A readable failure reason without exposing arbitrary response fields.
 */
export function adminProfileErrorMessage(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'body' in cause) {
    const body = cause.body
    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    )
      return body.message
  }
  return cause instanceof Error ? cause.message : 'Unable to save profile.'
}

/** Resolve a structured field rejection from the profile endpoint.
 * @param cause Remote error carrying a public field identifier.
 * @returns The editable field, or null for a page-level failure.
 */
export function adminProfileErrorField(
  cause: unknown,
): 'telephone' | 'email' | 'username' | 'whatsapp' | 'telegram' | null {
  if (!cause || typeof cause !== 'object' || !('body' in cause)) return null
  const body = cause.body
  if (!body || typeof body !== 'object' || !('field' in body)) return null
  return body.field === 'telephone' ||
    body.field === 'email' ||
    body.field === 'username' ||
    body.field === 'whatsapp' ||
    body.field === 'telegram'
    ? body.field
    : null
}
