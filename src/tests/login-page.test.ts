import { describe, expect, it } from 'vitest'

import { load } from '../routes/login/+page.server'

/** Creates the minimum login load event needed to exercise session redirects. */
function createEvent(options: { returnTo?: string; hasSession?: boolean } = {}) {
  const url = new URL('https://hype.example/login')
  if (options.returnTo) url.searchParams.set('returnTo', options.returnTo)

  return {
    locals:
      options.hasSession === false
        ? {}
        : { session: { id: 'session-1' }, user: { id: 'user-1' } },
    url,
  }
}

/** Asserts that a login load event ends in the expected SvelteKit redirect. */
function expectRedirect(event: ReturnType<typeof createEvent>, location: string): void {
  try {
    load(event as never)
  } catch (error) {
    expect(error).toMatchObject({ status: 302, location })
    return
  }

  throw new Error('Expected login load to redirect')
}

describe('login page load', () => {
  it('redirects an existing account session to the requested app path', () => {
    expectRedirect(createEvent({ returnTo: '/map?hub=core' }), '/map?hub=core')
  })

  it('keeps an existing guest on the page so they can upgrade or sign in', () => {
    const event = {
      locals: {
        session: { id: 'session-1' },
        user: { id: 'guest-1', isAnonymous: true },
      },
      url: new URL('https://hype.example/login'),
    }

    expect(load(event as never)).toBeUndefined()
  })

  it('does not redirect when no session exists', () => {
    expect(load(createEvent({ hasSession: false }) as never)).toBeUndefined()
  })

  it('rejects an external return destination', () => {
    expectRedirect(createEvent({ returnTo: 'https://attacker.example' }), '/')
  })
})
