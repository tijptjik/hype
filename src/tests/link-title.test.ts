import { afterEach, expect, it, vi } from 'vitest'
vi.mock('$app/env', () => ({ dev: false }))
vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(async () => ['93.184.216.34']),
  resolve6: vi.fn(async () => []),
}))
import { resolve4, resolve6 } from 'node:dns/promises'
import { fetchLinkTitle, isPublicAddress } from '#lib/server/link-title.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('rejects loopback, private, mapped and reserved addresses', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.2',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
    '2001::1',
    '2002:7f00:1::1',
  ])
    expect(isPublicAddress(ip)).toBe(false)
  expect(isPublicAddress('93.184.216.34')).toBe(true)
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
})
it('extracts a plain title and detected locale', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          '<html lang="zh-Hant"><head><title>Book &amp; Book &#39;edition&#39;</title></head>',
          { headers: { 'content-type': 'text/html' } },
        ),
    ),
  )
  expect(await fetchLinkTitle('https://example.org/book')).toEqual({
    title: "Book & Book 'edition'",
    locale: 'zhHant',
  })
})
it('never follows a redirect into a private destination', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  await expect(fetchLinkTitle('https://example.org')).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('does not read non-HTML responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response('binary', { headers: { 'content-type': 'image/png' } }),
    ),
  )
  expect(await fetchLinkTitle('https://example.org/image')).toBeNull()
})

it.each([resolve4, resolve6])(
  'bounds metadata lookup when a DNS resolver never settles',
  async resolver => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    vi.mocked(resolver).mockImplementationOnce(() => new Promise(() => {}))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    let outcome = 'pending'
    void fetchLinkTitle('https://example.org').then(
      () => {
        outcome = 'resolved'
      },
      () => {
        outcome = 'rejected'
      },
    )
    controller.abort(new Error('deadline exceeded'))
    await vi.waitFor(() => expect(outcome).toBe('rejected'), { timeout: 150 })
    expect(fetcher).not.toHaveBeenCalled()
  },
)
