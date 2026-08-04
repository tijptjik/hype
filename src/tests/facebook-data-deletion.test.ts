import { describe, expect, it } from 'vitest'
import {
  createFacebookDeletionConfirmationCode,
  parseFacebookSignedRequest,
} from '$lib/auth/facebook-data-deletion'

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('Facebook data deletion signed requests', () => {
  it('accepts a valid HMAC-SHA256 signed request', async () => {
    const appSecret = 'facebook-secret'
    const payload = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ user_id: 'facebook-user-1' })),
    )
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = toBase64Url(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
      ),
    )

    await expect(
      parseFacebookSignedRequest(`${signature}.${payload}`, appSecret),
    ).resolves.toEqual({ user_id: 'facebook-user-1' })
  })

  it('rejects a request signed with the wrong secret', async () => {
    const payload = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ user_id: 'facebook-user-1' })),
    )
    const signingKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('different-facebook-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = toBase64Url(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(payload)),
      ),
    )

    await expect(
      parseFacebookSignedRequest(`${signature}.${payload}`, 'facebook-secret'),
    ).resolves.toBeNull()
  })

  it('creates a stable confirmation code', async () => {
    await expect(
      createFacebookDeletionConfirmationCode('facebook-secret', 'facebook-user-1'),
    ).resolves.toMatch(/^[a-f0-9]{64}$/)
  })
})
