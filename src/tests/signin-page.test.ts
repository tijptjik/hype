import { describe, expect, it } from 'vitest'

import { load } from '../routes/signin/+page.server'
import { load as signUpLoad } from '../routes/signup/+page.server'

/** Creates the minimum sign-in load event needed to exercise session redirects. */
function createEvent(options: { returnTo?: string; hasSession?: boolean } = {}) {
  const url = new URL('https://hype.example/signin')
  if (options.returnTo) url.searchParams.set('returnTo', options.returnTo)

  return {
    locals:
      options.hasSession === false
        ? {}
        : { session: { id: 'session-1' }, user: { id: 'user-1' } },
    url,
  }
}

/** Asserts that a sign-in load event ends in the expected SvelteKit redirect. */
function expectRedirect(
  event: ReturnType<typeof createEvent>,
  location: string,
  routeLoad: (event: never) => unknown = load,
): void {
  try {
    routeLoad(event as never)
  } catch (error) {
    expect(error).toMatchObject({ status: 302, location })
    return
  }

  throw new Error('Expected sign-in load to redirect')
}

describe('sign-in page load', () => {
  it('redirects an existing account session to the requested app path', () => {
    expectRedirect(createEvent({ returnTo: '/map?hub=core' }), '/map?hub=core')
  })

  it('keeps an existing guest on the page so they can upgrade or sign in', () => {
    const event = {
      locals: {
        session: { id: 'session-1' },
        user: { id: 'guest-1', isAnonymous: true },
      },
      url: new URL('https://hype.example/signin'),
    }

    expect(load(event as never)).toBeUndefined()
  })

  it('does not redirect when no session exists', () => {
    expect(load(createEvent({ hasSession: false }) as never)).toBeUndefined()
  })

  it('gives the shareable sign-up route the same session protections', () => {
    expect(signUpLoad(createEvent({ hasSession: false }) as never)).toBeUndefined()
    expectRedirect(createEvent(), '/', signUpLoad)
  })

  it('rejects an external return destination', () => {
    expectRedirect(createEvent({ returnTo: 'https://attacker.example' }), '/')
  })
})
