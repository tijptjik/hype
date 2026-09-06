const encoder = new TextEncoder()

export type UploadTokenPayload = {
  publicId: string
  env: string
  ctxType: string
  ctxId: string
  filename: string
  replaceImageId?: string
  contentType: string
  size: number
  uploaderUserId: string
  exp: number
}

const toBase64Url = (value: ArrayBuffer | string): string => {
  const bytes =
    typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

const importKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )

/**
 * Creates an HMAC-signed upload token for the direct-to-R2 upload flow.
 * @param payload Upload claims to sign.
 * @param secret Signing secret.
 * @returns The signed token.
 */
export const createUploadToken = async (
  payload: UploadTokenPayload,
  secret: string,
): Promise<string> => {
  const data = JSON.stringify(payload)
  const key = await importKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return `${toBase64Url(data)}.${toBase64Url(signature)}`
}

/**
 * Verifies and decodes an HMAC-signed upload token.
 * @param token Untrusted upload token.
 * @param secret Signing secret.
 * @returns Valid upload claims, or null for malformed, invalid, or expired tokens.
 */
export const verifyUploadToken = async (
  token: string,
  secret: string,
): Promise<UploadTokenPayload | null> => {
  const parts = token.split('.')
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part)))
    return null
  const [dataPart, signaturePart] = parts

  // Invalid base64 is untrusted input, not a server failure.
  let payloadBytes: Uint8Array
  let signatureBytes: Uint8Array
  try {
    payloadBytes = fromBase64Url(dataPart)
    signatureBytes = fromBase64Url(signaturePart)
  } catch {
    return null
  }
  const payloadBuffer = Uint8Array.from(payloadBytes)
  const signatureBuffer = Uint8Array.from(signatureBytes)
  const key = await importKey(secret)
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBuffer,
    payloadBuffer,
  )
  if (!verified) return null

  // Authenticate the bytes before parsing, then validate claims before trusting them.
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(payloadBytes))
    if (!isUploadTokenPayload(payload) || payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Checks the shape and numeric bounds of authenticated upload claims.
 * @param value Decoded claims.
 * @returns Whether all required claims are usable upload values.
 */
const isUploadTokenPayload = (value: unknown): value is UploadTokenPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const claims = value as Record<string, unknown>
  const textClaims = [
    'publicId',
    'env',
    'ctxType',
    'ctxId',
    'filename',
    'contentType',
    'uploaderUserId',
  ]
  return (
    textClaims.every(
      key =>
        typeof claims[key] === 'string' && (claims[key] as string).trim().length > 0,
    ) &&
    typeof claims.size === 'number' &&
    Number.isSafeInteger(claims.size) &&
    claims.size > 0 &&
    typeof claims.exp === 'number' &&
    Number.isSafeInteger(claims.exp) &&
    claims.exp > 0 &&
    (claims.replaceImageId === undefined ||
      (typeof claims.replaceImageId === 'string' && claims.replaceImageId.length > 0))
  )
}
