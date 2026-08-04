import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => {
  const findFirst = vi.fn()
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const drizzle = vi.fn(() => ({
    query: { passkey: { findFirst } },
    update,
  }))
  return { drizzle, findFirst, set, update, where }
})

vi.mock('drizzle-orm/d1', () => ({ drizzle: dbMocks.drizzle }))

import { POST } from '../routes/api/account/passkey/+server'

interface PasskeyRouteOptions {
  isAnonymous?: boolean
  origin?: string | null
  hasPasskey?: boolean
}

/**
 * Creates the minimum route event required for account promotion tests.
 *
 * @param options - Session, origin, and registered-passkey overrides.
 * @returns A mocked SvelteKit event.
 */
function createEvent(options: PasskeyRouteOptions = {}) {
  const origin = options.origin === undefined ? 'https://hype.example' : options.origin
  const headers = new Headers()
  if (origin) headers.set('origin', origin)
  dbMocks.findFirst.mockResolvedValue(
    options.hasPasskey === false ? undefined : { id: 'passkey-1' },
  )

  return {
    request: new Request('https://hype.example/api/account/passkey', {
      method: 'POST',
      headers,
    }),
    url: new URL('https://hype.example/api/account/passkey'),
    locals: {
      session: { id: 'session-1' },
      user: { id: 'user-1', isAnonymous: options.isAnonymous ?? true },
    },
    platform: { env: { DB: {} } },
  }
}

describe('account passkey endpoint', () => {
  beforeEach(() => vi.clearAllMocks())

  it('promotes a guest only when a passkey is registered', async () => {
    const response = await POST(createEvent() as never)

    expect(response.status).toBe(200)
    expect(dbMocks.findFirst).toHaveBeenCalled()
    expect(dbMocks.set).toHaveBeenCalledWith({ isAnonymous: false })
  })

  it('rejects promotion without a registered passkey', async () => {
    await expect(
      POST(createEvent({ hasPasskey: false }) as never),
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'PASSKEY_REQUIRED' },
    })
    expect(dbMocks.set).not.toHaveBeenCalled()
  })

  it('rejects cross-origin requests before reading account data', async () => {
    await expect(
      POST(createEvent({ origin: 'https://attacker.example' }) as never),
    ).rejects.toMatchObject({ status: 403 })
    expect(dbMocks.findFirst).not.toHaveBeenCalled()
  })
})
