export const ANONYMOUS_BOOTSTRAP_ATTEMPTS = 3
export const ANONYMOUS_BOOTSTRAP_TIMEOUT_MS = 8_000

let anonymousSignInInFlight: Promise<void> | null = null

type SessionSnapshot = {
  isPending: boolean
  userId?: string | null
}

type AnonymousBootstrapOptions = {
  getSession: () => SessionSnapshot
  signInAnonymous: () => Promise<unknown>
  refetchSession: () => Promise<void>
  wait?: (durationMs: number) => Promise<void>
}

const defaultWait = (durationMs: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, durationMs))

/**
 * Returns whether the current route should create a guest account in the browser.
 *
 * @param pathname - Current application pathname.
 * @returns `true` for interactive application routes only.
 */
export function shouldBootstrapAnonymous(pathname: string): boolean {
  return ![
    '/admin',
    '/account',
    '/api',
    '/headless',
    '/signin',
    '/policy',
    '/proxy',
  ].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Creates one guest session and waits until Better Auth exposes its user.
 *
 * @param options - Session access and Better Auth client operations.
 * @returns Nothing once the session user is visible.
 * @remarks Concurrent callers share one in-flight request and retries are bounded.
 */
export async function bootstrapAnonymousSession(
  options: AnonymousBootstrapOptions,
): Promise<void> {
  if (anonymousSignInInFlight) return anonymousSignInInFlight

  anonymousSignInInFlight = (async () => {
    const wait = options.wait ?? defaultWait
    const startedAt = Date.now()

    while (
      options.getSession().isPending &&
      Date.now() - startedAt < ANONYMOUS_BOOTSTRAP_TIMEOUT_MS
    ) {
      await wait(50)
    }

    if (options.getSession().userId) return

    let lastError: unknown
    for (let attempt = 1; attempt <= ANONYMOUS_BOOTSTRAP_ATTEMPTS; attempt += 1) {
      if (options.getSession().userId) return
      try {
        await options.signInAnonymous()
        await options.refetchSession()

        const visibleAt = Date.now()
        while (Date.now() - visibleAt < ANONYMOUS_BOOTSTRAP_TIMEOUT_MS) {
          if (options.getSession().userId) return
          await wait(50)
        }
        lastError = new Error('Guest session did not become visible')
      } catch (error) {
        lastError = error
      }

      if (attempt < ANONYMOUS_BOOTSTRAP_ATTEMPTS) {
        await wait(150 * attempt)
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to create a guest session')
  })()

  try {
    await anonymousSignInInFlight
  } finally {
    anonymousSignInInFlight = null
  }
}
