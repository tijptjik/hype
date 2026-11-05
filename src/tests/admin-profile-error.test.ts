// @vitest-environment node
import { expect, it } from 'vitest'
import {
  adminProfileErrorMessage,
  adminProfileErrorField,
} from '#lib/users/adminProfileError.js'
it('preserves remote HttpError details even though they do not extend Error', () => {
  const cause = {
    status: 409,
    body: { message: 'This phone number is already assigned to another user.' },
  }
  expect(cause instanceof Error).toBe(false)
  expect(adminProfileErrorMessage(cause)).toBe(cause.body.message)
})
it('handles browser errors and missing details', () => {
  expect(adminProfileErrorMessage(new Error('Connection failed'))).toBe(
    'Connection failed',
  )
  expect(adminProfileErrorMessage({ body: null })).toBe('Unable to save profile.')
})

it('routes structured validation to the field without guessing from message text', () => {
  expect(
    adminProfileErrorField({ body: { field: 'telephone', message: 'Duplicate' } }),
  ).toBe('telephone')
  expect(adminProfileErrorField({ body: { field: 'untrusted' } })).toBeNull()
  expect(
    adminProfileErrorField({ body: { message: 'Phone request failed' } }),
  ).toBeNull()
})
