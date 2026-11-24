import { afterEach, expect, mock, test } from 'bun:test'
import { lookupSheet } from './csdi.server'

const originalFetch = globalThis.fetch
const index = Response.json({
  features: [
    {
      attributes: {
        SHEETNO: 'test',
        Format_glTF: 'https://download.map.gov.hk/api/3d-zip/GLTF/test.zip',
      },
    },
  ],
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('rejects archive redirects without asking Workers to use unsupported redirect error mode', async () => {
  const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    if (!init) return index.clone()
    expect(init.redirect).toBe('manual')
    return new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/' },
    })
  })
  globalThis.fetch = fetchMock as typeof fetch
  await expect(lookupSheet([114.19, 22.33])).rejects.toThrow(
    'Could not inspect CSDI archive',
  )
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('rejects redirects on archive ranges', async () => {
  const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    if (!init) return index.clone()
    expect(init.redirect).toBe('manual')
    if (init.method === 'HEAD')
      return new Response(null, {
        headers: { etag: '"revision"', 'content-length': '100' },
      })
    return new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/' },
    })
  })
  globalThis.fetch = fetchMock as typeof fetch
  await expect(lookupSheet([114.19, 22.33])).rejects.toThrow(
    'CSDI did not return the requested archive range',
  )
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
