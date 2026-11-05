// @vitest-environment node
import { expect, it } from 'vitest'
import { validateAdminPhoneFields } from '#lib/users/adminPhoneValidation.js'
const empty = { whatsapp: '', telegram: '', preferredPlatform: null }
it('rejects trailing letters on primary and service phone numbers before submit', () => {
  const errors = validateAdminPhoneFields('+85291491763x', {
    ...empty,
    whatsapp: '+85291491763x',
    telegram: '+85291491763f',
  })
  expect(Object.keys(errors)).toEqual(['telephone', 'whatsapp', 'telegram'])
  expect(Object.values(errors).every(message => message.includes('number'))).toBe(true)
})
it('clears errors for valid Hong Kong, international, username and empty values', () => {
  expect(
    validateAdminPhoneFields('91491763', {
      ...empty,
      whatsapp: '+85291491763',
      telegram: '@valid_user',
    }),
  ).toEqual({})
  expect(validateAdminPhoneFields('', empty)).toEqual({})
})
it('does not reject unchanged native-ID-only identities', () => {
  const saved = { ...empty, telegram: '42' }
  expect(validateAdminPhoneFields(null, saved, saved)).toEqual({})
  expect(
    validateAdminPhoneFields(null, { ...saved, telegram: '43' }, saved),
  ).toHaveProperty('telegram')
})
