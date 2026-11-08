// TYPES
import type { BrowserContext } from 'playwright'

/** Authenticate a local test account while respecting the auth endpoint's retry window.
 * @param context Isolated browser session owned by the test.
 * @param origin Local app origin.
 * @param email Explicit test account email.
 * @param password Password supplied through the test runner environment.
 * @returns The final HTTP status, leaving failed authentication visible to assertions.
 */
export async function loginLocalTestAccount(
  context: BrowserContext,
  origin: string,
  email: string,
  password: string,
): Promise<number> {
  if (
    !['hype.localhost', 'localhost', '127.0.0.1'].includes(new URL(origin).hostname)
  ) {
    throw new Error('Test credentials may only be sent to local origins')
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await context.request.post(`${origin}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email, password },
      timeout: 30000,
    })
    if (response.status() !== 429 || attempt === 4) return response.status()
    const retryAfter = Number(response.headers()['retry-after'])
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 1 : 61
    console.log(
      `Authentication rate limited; waiting ${seconds}s before retry ${attempt + 1}`,
    )
    await new Promise(resolve => setTimeout(resolve, seconds * 1000))
  }
  throw new Error('Unreachable login retry state')
}
