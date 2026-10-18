// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { goto } from '$app/navigation'
import { navigateAfterAuth } from '#lib/auth/navigation.js'

vi.mock('$app/env', () => ({ browser: true }))
vi.mock('$app/navigation', () => ({ goto: vi.fn() }))

const mockedGoto = vi.mocked(goto)

beforeEach(() => {
  mockedGoto.mockReset().mockResolvedValue(undefined)
})

describe('post-auth return navigation', () => {
  it('preserves a valid same-origin path, query and hash', async () => {
    const destination = '/features/example?panel=profile#details'
    await navigateAfterAuth(`${window.location.origin}${destination}`)
    expect(mockedGoto).toHaveBeenCalledExactlyOnceWith(destination)
  })

  it('falls back to home when Kit rejects a missing application route', async () => {
    mockedGoto.mockRejectedValueOnce(new Error('No route found'))
    await navigateAfterAuth('/obsolete-route')
    expect(mockedGoto.mock.calls).toEqual([['/obsolete-route'], ['/']])
  })

  it.each([
    'https://outside.example/path',
    '//outside.example/path',
    'javascript:alert(1)',
  ])('uses home instead of navigating to %s', async destination => {
    await navigateAfterAuth(destination)
    expect(mockedGoto).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('propagates a failed home navigation without retrying indefinitely', async () => {
    const failure = new Error('Navigation cancelled')
    mockedGoto.mockRejectedValueOnce(failure)
    await expect(navigateAfterAuth('/')).rejects.toBe(failure)
    expect(mockedGoto).toHaveBeenCalledExactlyOnceWith('/')
  })
})
