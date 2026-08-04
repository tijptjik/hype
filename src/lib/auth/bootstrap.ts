export const ANONYMOUS_BOOTSTRAP_ATTEMPTS = 3
export const ANONYMOUS_BOOTSTRAP_TIMEOUT_MS = 8_000

const SIGN_OUT_INTENT_STORAGE_KEY = 'hype:sign-out-intent'

const AUTH_ENTRY_PATHS = new Set(['/signin', '/signup'])

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
 * Marks the current browser session as intentionally signing out.
 *
 * @returns Nothing.
 * @remarks This prevents the root session watcher from racing a sign-out redirect
 * by creating an anonymous session before the sign-in page is reached.
 */
export function markSignOutIntent(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SIGN_OUT_INTENT_STORAGE_KEY, '1')
}

/**
 * Clears a pending intentional sign-out marker.
 *
 * @returns Nothing.
 */
export function clearSignOutIntent(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SIGN_OUT_INTENT_STORAGE_KEY)
}

/**
 * Consumes the pending intentional sign-out marker, if present.
 *
 * @returns Whether a sign-out initiated the current no-session state.
 */
export function consumeSignOutIntent(): boolean {
  if (typeof window === 'undefined') return false

  const hasIntent = window.sessionStorage.getItem(SIGN_OUT_INTENT_STORAGE_KEY) === '1'
  if (hasIntent) clearSignOutIntent()
  return hasIntent
}

/**
 * Returns whether a route must render before the application resource bootstrap ends.
 *
 * @param pathname - The browser pathname to evaluate.
 * @returns `true` for shared sign-in and sign-up entry routes.
 * @remarks Auth entry routes contain their own map landing surface and must never be
 * hidden behind account, guest, or feature-resource initialization.
 */
export function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.has(pathname)
}

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
