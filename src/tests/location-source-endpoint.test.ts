import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
beforeEach(() => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('HYPE_LOCATION_SOURCE_URL', '')
})
afterEach(() => vi.unstubAllEnvs())
it('always uses hosted credentials outside development', () => {
  vi.stubEnv('HYPE_LOCATION_SOURCE_URL', 'http://127.0.0.1:8787')
  expect(locationSourceEndpoint('hosted-key')).toEqual({
    baseUrl: 'https://api.saanseoi.hk',
    apiKey: 'hosted-key',
  })
})
it('uses a dummy credential for explicit loopback development', () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('HYPE_LOCATION_SOURCE_URL', 'http://127.0.0.1:8787')
  expect(locationSourceEndpoint('hosted-key')).toEqual({
    baseUrl: 'http://127.0.0.1:8787',
    apiKey: 'local-development',
  })
})
it.each([
  'https://example.com',
  'http://127.0.0.1.example.com',
  'http://user:pass@localhost',
  'http://localhost/path',
  'http://localhost?query',
  'http://localhost/#hash',
])('rejects unsafe local endpoint %s', url => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('HYPE_LOCATION_SOURCE_URL', url)
  expect(() => locationSourceEndpoint('hosted-key')).toThrow('loopback')
})

it('defaults development to the local Atlas API without hosted credentials', () => {
  vi.stubEnv('DEV', true)
  expect(locationSourceEndpoint('hosted-key')).toEqual({
    baseUrl: 'http://api.atlas.localhost',
    apiKey: 'local-development',
  })
})
