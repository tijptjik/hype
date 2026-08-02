import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'
import { POST } from '../routes/api/account/password/+server'

interface PasswordRouteOptions {
  isAnonymous?: boolean
  origin?: string | null
  setPassword?: ReturnType<typeof vi.fn>
}

/**
 * Creates the minimum SvelteKit event shape needed by the password route.
 *
 * @param options - Session, origin, and Better Auth behavior overrides.
 * @returns A route event and its `setPassword` spy.
 */
function createEvent(options: PasswordRouteOptions = {}) {
  const origin = options.origin === undefined ? 'https://hype.example' : options.origin
  const headers = new Headers({ 'content-type': 'application/json' })
  if (origin) headers.set('origin', origin)
  const setPassword = options.setPassword ?? vi.fn().mockResolvedValue({ status: true })

  return {
    event: {
      request: new Request('https://hype.example/api/account/password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ newPassword: 'a-secure-password' }),
      }),
      url: new URL('https://hype.example/api/account/password'),
      locals: {
        session: { id: 'session-1' },
        user: { id: 'user-1', isAnonymous: options.isAnonymous ?? false },
        auth: { api: { setPassword } },
      },
    },
    setPassword,
  }
}

describe('account password endpoint', () => {
  it('adds a credential through Better Auth for an upgraded account', async () => {
    const { event, setPassword } = createEvent()

    const response = await POST(event as never)

    expect(response?.status).toBe(200)
    expect(setPassword).toHaveBeenCalledWith({
      body: { newPassword: 'a-secure-password' },
      headers: event.request.headers,
    })
  })

  it('rejects guest accounts with ACCOUNT_REQUIRED', async () => {
    const { event, setPassword } = createEvent({ isAnonymous: true })

    await expect(POST(event as never)).rejects.toMatchObject({
      status: 403,
      body: { message: 'ACCOUNT_REQUIRED' },
    })
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('rejects cross-origin requests before changing credentials', async () => {
    const { event, setPassword } = createEvent({ origin: 'https://attacker.example' })

    await expect(POST(event as never)).rejects.toMatchObject({ status: 403 })
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('does not replace an existing credential password', async () => {
    const setPassword = vi
      .fn()
      .mockRejectedValue(
        new APIError('BAD_REQUEST', { message: 'PASSWORD_ALREADY_SET' }),
      )
    const { event } = createEvent({ setPassword })

    await expect(POST(event as never)).rejects.toMatchObject({
      status: 400,
      body: { message: 'PASSWORD_NOT_SET' },
    })
  })
})
