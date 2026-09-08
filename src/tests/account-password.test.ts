import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'
import { POST } from '../routes/api/account/password/+server'

interface PasswordRouteOptions {
  isAnonymous?: boolean
  origin?: string | null
  email?: string
  userEmail?: string
  changeEmail?: ReturnType<typeof vi.fn>
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
  const changeEmail = options.changeEmail ?? vi.fn()
  const setPassword = options.setPassword ?? vi.fn().mockResolvedValue({ status: true })

  return {
    event: {
      request: new Request('https://hype.example/api/account/password', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          newPassword: 'a-secure-password',
          ...(options.email ? { email: options.email } : {}),
        }),
      }),
      url: new URL('https://hype.example/api/account/password'),
      locals: {
        session: { id: 'session-1' },
        user: {
          id: 'user-1',
          email: options.userEmail ?? 'old@example.test',
          isAnonymous: options.isAnonymous ?? false,
        },
        auth: { api: { changeEmail, setPassword } },
      },
    },
    changeEmail,
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

  it('forwards Better Auth session cookies after changing the login email', async () => {
    const changeEmail = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: true }), {
        headers: { 'set-cookie': 'better-auth.session_data=updated' },
      }),
    )
    const { event, setPassword } = createEvent({
      changeEmail,
      email: 'new@example.test',
    })

    const response = await POST(event as never)

    expect(changeEmail).toHaveBeenCalledWith({
      body: {
        newEmail: 'new@example.test',
        callbackURL: 'https://hype.example/?panel=profile',
      },
      headers: event.request.headers,
      asResponse: true,
    })
    expect(setPassword).toHaveBeenCalledOnce()
    expect(response.headers.get('set-cookie')).toBe('better-auth.session_data=updated')
  })

  it.each([400, 401, 403, 500])(
    'does not create a password after an email-change HTTP %s response',
    async status => {
      const changeEmail = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Email change rejected' }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      )
      const { event, setPassword } = createEvent({
        changeEmail,
        email: 'new@example.test',
      })

      const response = await POST(event as never)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: 'PASSWORD_NOT_SET' })
      expect(setPassword).not.toHaveBeenCalled()
    },
  )
})
