import { beforeEach, describe, expect, it, vi } from 'vitest'
import { account, user } from '$lib/db/schema'

const dbMocks = vi.hoisted(() => {
  const findFacebookAccount = vi.fn()
  const findLinkedAccounts = vi.fn()
  const findPasskey = vi.fn()
  const findUser = vi.fn()
  const where = vi.fn().mockResolvedValue(undefined)
  const deleteRecord = vi.fn(() => ({ where }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const transaction = vi.fn()
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn(() => ({ onConflictDoNothing }))
  const insert = vi.fn(() => ({ values }))
  const transactionDb = {
    query: {
      account: { findMany: findLinkedAccounts },
      passkey: { findFirst: findPasskey },
      user: { findFirst: findUser },
    },
    delete: deleteRecord,
    update,
  }
  const drizzle = vi.fn(() => ({
    query: { account: { findFirst: findFacebookAccount } },
    transaction,
    insert,
  }))

  return {
    deleteRecord,
    drizzle,
    findFacebookAccount,
    findLinkedAccounts,
    findPasskey,
    findUser,
    set,
    transaction,
    transactionDb,
  }
})

vi.mock('drizzle-orm/d1', () => ({ drizzle: dbMocks.drizzle }))

import { POST } from '../routes/api/auth/facebook/data-deletion/+server'

const appSecret = 'facebook-secret'

/**
 * Encodes bytes in Facebook's URL-safe base64 format.
 *
 * @param bytes - Bytes to encode.
 * @returns URL-safe base64 text without padding.
 */
function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Creates an authenticated Facebook deletion callback event.
 *
 * @returns Minimum SvelteKit request event consumed by the deletion route.
 */
async function createEvent(): Promise<unknown> {
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
  const form = new FormData()
  form.set('signed_request', `${signature}.${payload}`)

  return {
    request: new Request('https://hype.example/api/auth/facebook/data-deletion', {
      method: 'POST',
      body: form,
    }),
    url: new URL('https://hype.example/api/auth/facebook/data-deletion'),
    platform: { env: { AUTH_FACEBOOK_SECRET: appSecret, DB: {} } },
  }
}

describe('Facebook data deletion callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.findFacebookAccount.mockResolvedValue({
      id: 'account-facebook',
      userId: 'user-1',
    })
    dbMocks.findLinkedAccounts.mockResolvedValue([{ id: 'account-facebook' }])
    dbMocks.findPasskey.mockResolvedValue(undefined)
    dbMocks.findUser
      .mockResolvedValueOnce({ id: 'user-1' })
      .mockResolvedValue(undefined)
    dbMocks.transaction.mockImplementation(callback => callback(dbMocks.transactionDb))
  })

  it('anonymizes and archives an account whose final sign-in method was Facebook', async () => {
    const response = await POST((await createEvent()) as never)

    expect(response.status).toBe(200)
    expect(dbMocks.deleteRecord).toHaveBeenCalledWith(account)
    expect(dbMocks.deleteRecord).not.toHaveBeenCalledWith(user)
    expect(dbMocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Deleted User',
        email: 'deleted+user-1@hype.invalid',
        emailVerified: false,
        image: null,
        attribution: null,
        isArchived: true,
      }),
    )
  })

  it('only unlinks Facebook when another account remains available for sign-in', async () => {
    dbMocks.findLinkedAccounts.mockResolvedValue([
      { id: 'account-facebook' },
      { id: 'account-credential' },
    ])

    const response = await POST((await createEvent()) as never)

    expect(response.status).toBe(200)
    expect(dbMocks.deleteRecord).toHaveBeenCalledTimes(1)
    expect(dbMocks.deleteRecord).toHaveBeenCalledWith(account)
    expect(dbMocks.set).not.toHaveBeenCalled()
  })

  it('keeps the account available when a passkey is its other sign-in method', async () => {
    dbMocks.findPasskey.mockResolvedValue({ id: 'passkey-1' })

    await POST((await createEvent()) as never)

    expect(dbMocks.deleteRecord).toHaveBeenCalledTimes(1)
    expect(dbMocks.set).not.toHaveBeenCalled()
  })
})
