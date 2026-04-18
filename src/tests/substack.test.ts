// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSubstackSessionCookie,
  toSubstackSubscribeUrl,
} from '$lib/api/external/substack.shared'
import { subscribeToSubstack } from '$lib/api/external/substack'

describe('normalizeSubstackSessionCookie', () => {
  it('extracts the cookie pair from a pasted set-cookie value', () => {
    expect(
      normalizeSubstackSessionCookie(
        'substack.sid=s%3Atest-session-token.abc123; Path=/; HttpOnly; Secure',
      ),
    ).toBe('substack.sid=s%3Atest-session-token.abc123')
  })

  it('passes through an already-trimmed cookie pair', () => {
    expect(normalizeSubstackSessionCookie('  substack.sid=raw-session-token  ')).toBe(
      'substack.sid=raw-session-token',
    )
  })

  it('keeps other cookie names intact', () => {
    expect(normalizeSubstackSessionCookie('connect.sid=legacy-token')).toBe(
      'connect.sid=legacy-token',
    )
  })
})

describe('toSubstackSubscribeUrl', () => {
  it('returns the public publication root with a trailing slash', () => {
    expect(toSubstackSubscribeUrl('example')).toBe('https://example.substack.com/')
    expect(toSubstackSubscribeUrl('https://example.substack.com/')).toBe(
      'https://example.substack.com/',
    )
  })
})

describe('subscribeToSubstack', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the authenticated Substack subscriber endpoint when a session cookie is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'subscriber-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await subscribeToSubstack(
      'person@example.com',
      'example',
      'substack.sid=normalized-session-token',
    )

    expect(result).toEqual({ id: 'subscriber-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.substack.com/api/v1/subscriber/add',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          accept: 'application/json',
          'cache-control': 'no-cache',
          origin: 'https://example.substack.com',
          pragma: 'no-cache',
          referer: 'https://example.substack.com/publish/subscribers/add',
          cookie: 'substack.sid=normalized-session-token',
        }),
      }),
    )

    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(requestInit).toBeDefined()
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      email: 'person@example.com',
      subscription: false,
      sendEmail: true,
    })
  })

  it('posts the expected payload directly to the Substack free signup endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          getSetCookie: () => [
            '__cf_bm=bot-cookie; Path=/; Secure',
            'ab_testing_id=abc; Path=/; Secure',
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await subscribeToSubstack('person@example.com', 'example')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.substack.com/subscribe',
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining('text/html'),
          'user-agent': expect.stringContaining('Chrome/128.0.0.0'),
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.substack.com/api/v1/free',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          accept: 'application/json',
          origin: 'https://example.substack.com',
          referer: 'https://example.substack.com/subscribe',
          cookie: '__cf_bm=bot-cookie; ab_testing_id=abc',
        }),
      }),
    )

    const requestInit = fetchMock.mock.calls[1]?.[1]
    expect(requestInit).toBeDefined()
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      first_url: 'https://example.substack.com/subscribe',
      first_referrer: '',
      current_url: 'https://example.substack.com/subscribe',
      current_referrer: '',
      first_session_url: 'https://example.substack.com/subscribe',
      first_session_referrer: '',
      referral_code: '',
      source: 'subscribe_page',
      referring_pub_id: '',
      additional_referring_pub_ids: '',
      email: 'person@example.com',
    })
  })

  it('returns a provider error object when Substack rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'provider down',
      }),
    )

    await expect(
      subscribeToSubstack(
        'person@example.com',
        'https://example.substack.com/',
        'substack.sid=normalized-session-token',
      ),
    ).resolves.toEqual({
      error: 'Error 500',
      details: 'provider down',
      status: 500,
    })
  })

  it('returns a provider error object when the admin session cookie is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      }),
    )

    const result = await subscribeToSubstack(
      'person@example.com',
      'https://example.substack.com/',
      'substack.sid=normalized-session-token',
    )

    expect(result).toEqual({
      error: 'Error 403',
      details: 'forbidden',
      status: 403,
    })
  })
})
