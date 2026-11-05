/** Read historical email metadata from a server-stored Google sign-in token.
 * @param account Linked provider identity and its privately stored token.
 * @returns A matching historical email claim, never a credential or verification assertion.
 * @remarks This is display-only evidence. No token is returned, no network call is made,
 * and the claim must match the linked subject and Google's issuer. It never grants access.
 */
export function retainedSignInEmail(account: {
  providerId: string
  accountId: string
  idToken: string | null
}): string | null {
  if (account.providerId !== 'google' || !account.idToken) return null
  try {
    const parts = account.idToken.split('.')
    if (parts.length !== 3) return null
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')),
      c => c.charCodeAt(0),
    )
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    if (
      claims.sub !== account.accountId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    )
      return null
    return typeof claims.email === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
      ? claims.email
      : null
  } catch {
    return null
  }
}
