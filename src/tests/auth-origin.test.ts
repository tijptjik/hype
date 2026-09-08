// @vitest-environment node
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it, vi } from 'vitest'
import { getAuthForRequest, getBaseUrlFromRequestHeaders } from '$lib/auth'

describe('authentication origin resolution', () => {
  it('uses the same host as hub routing, ignoring forwarded-host overrides', () => {
    expect(
      getBaseUrlFromRequestHeaders(
        new Headers({
          host: 'breadline.hk',
          'x-forwarded-host': 'attacker.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://breadline.hk')
  })

  it.each(['localhost:5173', '127.0.0.1:4173', '[::1]:5173'])(
    'preserves local HTTP hosts and ports: %s',
    host => {
      expect(
        getBaseUrlFromRequestHeaders(
          new Headers({
            host,
            'x-forwarded-proto': 'http',
          }),
        ),
      ).toBe(`http://${host}`)
    },
  )

  it.each([
    'hype.hk@attacker.example',
    'hype.hk/path',
    'hype.hk?query',
    'hype.hk#fragment',
    'hype.hk,attacker.example',
    'hype.hk\\attacker.example',
  ])('rejects a malformed host authority: %s', host => {
    expect(() =>
      getBaseUrlFromRequestHeaders(
        new Headers({
          host,
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toThrow()
  })

  it.each(['ftp', 'javascript', 'https,http', 'https://attacker.example/'])(
    'rejects unsupported or malformed transport protocols: %s',
    proto => {
      expect(() =>
        getBaseUrlFromRequestHeaders(
          new Headers({
            host: 'hype.hk',
            'x-forwarded-proto': proto,
          }),
        ),
      ).toThrow()
    },
  )

  it('does not use a forwarded host when the routing host is missing', () => {
    expect(() =>
      getBaseUrlFromRequestHeaders(
        new Headers({
          'x-forwarded-host': 'attacker.example',
        }),
      ),
    ).toThrow()
  })

  it('keeps password-reset links and trusted origins on the routed host', async () => {
    const host = 'hype.hk'
    const headers = new Headers({
      host,
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'attacker.example',
    })
    const runtime = getAuthForRequest(headers, {
      DB: {} as never,
      AUTH_SECRET: 'test-secret-long-enough-for-auth-origin-tests',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      AUTH_FACEBOOK_ID: '',
      AUTH_FACEBOOK_SECRET: '',
    })
    const sendResetPassword = vi.fn(async () => {})
    const auth = betterAuth({
      ...runtime.options,
      // Better Auth relaxes origin checks in test mode unless explicitly enabled.
      advanced: {
        ...runtime.options.advanced,
        disableOriginCheck: false,
        disableCSRFCheck: false,
      },
      database: memoryAdapter({
        user: [
          {
            id: 'user',
            name: 'User',
            email: 'user@example.com',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        verification: [],
        account: [],
      }),
      emailAndPassword: {
        ...runtime.options.emailAndPassword,
        enabled: true,
        sendResetPassword,
      },
      rateLimit: { enabled: false },
    })
    const response = await auth.handler(
      new Request(`https://${host}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: {
          ...Object.fromEntries(headers),
          origin: `https://${host}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(sendResetPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/^https:\/\/hype\.hk\/api\/auth\/reset-password\//),
      }),
      expect.anything(),
    )
    const context = await auth.$context
    expect(context.trustedOrigins).not.toContain('https://attacker.example')
    expect(runtime.options.onAPIError?.errorURL).toBe(`https://${host}/signin`)
    const rejected = await auth.handler(
      new Request(`https://${host}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: {
          ...Object.fromEntries(headers),
          origin: 'https://attacker.example',
          cookie: 'theme=dark',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
    )
    expect(rejected.status).toBe(403)
    expect(sendResetPassword).toHaveBeenCalledTimes(1)
  })
})
