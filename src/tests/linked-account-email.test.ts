// @vitest-environment node
import { expect, it } from 'vitest'
import { retainedSignInEmail } from '#lib/users/linkedAccountEmail.js'
const token = (claims: object) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
it('projects a historical email only for the linked Google subject and issuer', () => {
  const claims = {
    sub: 'subject',
    iss: 'https://accounts.google.com',
    email: 'old@example.com',
    exp: 1,
  }
  const account = { providerId: 'google', accountId: 'subject', idToken: token(claims) }
  expect(retainedSignInEmail(account)).toBe('old@example.com')
  expect(retainedSignInEmail({ ...account, accountId: 'another' })).toBeNull()
  expect(retainedSignInEmail({ ...account, providerId: 'facebook' })).toBeNull()
  expect(
    retainedSignInEmail({
      ...account,
      idToken: token({ ...claims, iss: 'untrusted' }),
    }),
  ).toBeNull()
  expect(retainedSignInEmail({ ...account, idToken: 'malformed' })).toBeNull()
  expect(retainedSignInEmail({ ...account, idToken: null })).toBeNull()
})
