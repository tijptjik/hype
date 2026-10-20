import { describe, expect, it } from 'vitest'
import {
  PropertyAdminProfileAPI,
  PropertyDetailProfileAPI,
} from '#lib/db/zod/schema/property.js'

describe('imported property component compatibility', () => {
  for (const schema of [PropertyAdminProfileAPI, PropertyDetailProfileAPI]) {
    it('returns the supported single-line editor for legacy ELN fields', () => {
      expect(schema.shape.component.parse('TextField')).toBe('InputField')
      expect(schema.shape.component.parse('InputField')).toBe('InputField')
    })
    it('continues rejecting unknown components', () => {
      expect(schema.shape.component.safeParse('UnknownField').success).toBe(false)
    })
  }
})
