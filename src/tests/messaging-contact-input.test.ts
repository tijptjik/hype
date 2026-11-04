// TESTS
import { expect, it } from 'vitest'
// MESSAGING
import {
  parseMessagingContact,
  shouldValidateMessagingContact,
} from '#lib/messaging/contactInput.js'

it.each(['91234567', '9123 4567', '85291234567', '+852 (9123) 4567'])(
  'normalizes %s to a valid Hong Kong phone',
  input => {
    expect(parseMessagingContact(input)).toEqual({
      kind: 'valid',
      value: '+85291234567',
      identity: { phoneNumber: '+85291234567', username: null, nativeId: null },
    })
  },
)
it.each(['synthetic_user', '@Synthetic_User'])('recognizes %s as a username', input => {
  expect(parseMessagingContact(input)).toMatchObject({
    kind: 'valid',
    value: '@synthetic_user',
    identity: { phoneNumber: null, username: 'synthetic_user', nativeId: null },
  })
})
it.each([
  '42',
  '9123456',
  '00000000',
  '+852912345678',
  '@abc',
  '123name',
  'name with spaces',
  '+85291234567 ext 8',
])('rejects incomplete or malformed input %s without inventing a native ID', input => {
  expect(parseMessagingContact(input).kind).toBe('invalid')
})
it('accepts international numbers and intentional clearing', () => {
  expect(parseMessagingContact('+1 202 555 0123')).toMatchObject({
    kind: 'valid',
    value: '+12025550123',
  })
  expect(parseMessagingContact('   ')).toEqual({ kind: 'empty' })
})

it.each([
  ['914', false],
  ['9123 456', false],
  ['9123 4567', true],
  ['+852 91234', false],
  ['+852 9123 4567', true],
  ['00852 91234', false],
  ['abc', false],
  ['@abc', false],
  ['abcd', true],
  ['@abcd', true],
  ['   ', true],
] as const)('gates typing feedback for %s', (input, ready) => {
  expect(shouldValidateMessagingContact(input)).toBe(ready)
})
