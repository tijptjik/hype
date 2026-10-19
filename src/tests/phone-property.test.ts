// TESTING
import { describe, expect, it, vi } from 'vitest'
// VALIDATION
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
import { validateFeaturePhoneProperties } from '#lib/db/services/feature-property-validation.js'
import {
  PropertyRecordCreate,
  PropertyRecordUpdate,
} from '#lib/db/zod/schema/property.js'
import type { Database } from '#lib/types.js'

describe('Hong Kong phone properties', () => {
  it.each(['2345 6789', '+852 2345-6789', '(852) 23456789'])(
    'handles formatted input %s',
    input => {
      expect(normalizeHongKongPhoneNumber(input)).toBe(
        input.startsWith('(852)') ? null : '+85223456789',
      )
    },
  )
  it('accepts mobile numbers as well as landlines', () => {
    expect(normalizeHongKongPhoneNumber('91234567')).toBe('+85291234567')
  })
  it.each([
    '',
    '12345678',
    '+853 66123456',
    '+8522345678',
    '234567890',
    'call 23456789',
    '23456789 ext 12',
    '23456789/91234567',
  ])('rejects %s', input => {
    expect(normalizeHongKongPhoneNumber(input)).toBeNull()
  })
  it('uses persisted types and ignores spoofed client metadata', async () => {
    const db = {
      query: { property: { findMany: vi.fn().mockResolvedValue([{ id: 'phone' }]) } },
    } as unknown as Database
    const rows = [
      {
        propertyId: 'phone',
        value: '2345 6789',
        property: { component: 'InputField' },
      },
      { propertyId: 'text', value: 'arbitrary text' },
    ]
    expect(await validateFeaturePhoneProperties(db, rows)).toMatchObject([
      { value: '+85223456789' },
      { value: 'arbitrary text' },
    ])
    expect(rows[0].value).toBe('2345 6789')
    await expect(
      validateFeaturePhoneProperties(db, [{ propertyId: 'phone', value: 'invalid' }]),
    ).rejects.toThrow()
    await expect(
      validateFeaturePhoneProperties(db, [
        { propertyId: 'phone', propertyValueId: 'bypass' },
      ]),
    ).rejects.toThrow()
    expect(
      await validateFeaturePhoneProperties(db, [{ propertyId: 'phone', value: '' }]),
    ).toMatchObject([{ value: null }])
  })
  it('rejects translatable phone definitions on create and update', () => {
    const definition = {
      key: 'phone',
      type: 'specifier',
      component: 'PhoneField',
      isTranslatable: true,
    }
    expect(PropertyRecordCreate.safeParse(definition).success).toBe(false)
    expect(PropertyRecordUpdate.safeParse(definition).success).toBe(false)
    expect(
      PropertyRecordUpdate.safeParse({ ...definition, isTranslatable: false }).success,
    ).toBe(true)
  })
})
