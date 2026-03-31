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
 */
export const verifyUploadToken = async (
  token: string,
  secret: string,
): Promise<UploadTokenPayload | null> => {
  const [dataPart, signaturePart] = token.split('.')
  if (!dataPart || !signaturePart) return null

  const payloadBytes = fromBase64Url(dataPart)
  const payloadBuffer = Uint8Array.from(payloadBytes)
  const signatureBytes = fromBase64Url(signaturePart)
  const signatureBuffer = Uint8Array.from(signatureBytes)
  const key = await importKey(secret)
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBuffer,
    payloadBuffer,
  )
  if (!verified) return null

  const payload = JSON.parse(
    new TextDecoder().decode(payloadBytes),
  ) as UploadTokenPayload
  if (payload.exp < Date.now()) return null
  return payload
}
