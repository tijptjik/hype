/**
 * Decodes Facebook's URL-safe base64 encoding.
 *
 * @param value - URL-safe base64 string.
 * @returns Decoded bytes.
 */
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

/**
 * Verifies and parses a Facebook signed request.
 *
 * @param signedRequest - Facebook's `signature.payload` request value.
 * @param appSecret - Facebook app secret used to sign the payload.
 * @returns Facebook payload containing the app-scoped user ID, or `null` when invalid.
 * @remarks Only HMAC-SHA256 signed requests are accepted.
 */
export async function parseFacebookSignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<{ user_id: string } | null> {
  const [encodedSignature, encodedPayload] = signedRequest.split('.', 2)
  if (!encodedSignature || !encodedPayload || !appSecret) return null

  let signature: Uint8Array
  let payload: Uint8Array
  try {
    signature = decodeBase64Url(encodedSignature)
    payload = decodeBase64Url(encodedPayload)
  } catch {
    return null
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature as unknown as BufferSource,
    new TextEncoder().encode(encodedPayload),
  )
  if (!isValid) return null

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('user_id' in parsed) ||
      typeof parsed.user_id !== 'string' ||
      !parsed.user_id
    ) {
      return null
    }
    return { user_id: parsed.user_id }
  } catch {
    return null
  }
}

/**
 * Creates a deterministic status token for a completed deletion request.
 *
 * @param appSecret - Facebook app secret used to protect the status token.
 * @param userId - HYPE user ID whose account was deleted.
 * @returns Hexadecimal confirmation code.
 */
export async function createFacebookDeletionConfirmationCode(
  appSecret: string,
  userId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`facebook-deletion:${userId}`),
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
