import { describe, expect, it } from 'vitest'
import {
  DisplayTemplateDefinitionSchema,
  renderLocalizedDisplayTemplate,
} from '../lib/templates/registry'
import { SYSTEM_DISPLAY_TEMPLATES } from '../lib/templates/system'

describe('system display template catalogue', () => {
  it('provides valid read-only Feature and Location defaults', () => {
    for (const template of SYSTEM_DISPLAY_TEMPLATES) {
      const { id, system, organisationId, version, ...definition } = template
      expect(DisplayTemplateDefinitionSchema.safeParse(definition).success).toBe(true)
      expect(system).toBe(true)
      expect(organisationId).toBeNull()
      // Version zero cannot pass the API schema for assigning registry versions.
      expect(version).toBe(0)
      expect(id).toMatch(/^system:/)
    }
    expect(
      SYSTEM_DISPLAY_TEMPLATES.filter(item => item.target === 'location'),
    ).toHaveLength(2)
  })
  it('uses the brand with an optional branch, then falls back to the provided name', () => {
    const branded = SYSTEM_DISPLAY_TEMPLATES.find(
      item => item.id === 'system:location-brand-branch',
    )
    const plain = SYSTEM_DISPLAY_TEMPLATES.find(
      item => item.id === 'system:location-name',
    )
    if (!branded || !plain) throw new Error('Missing Location system defaults')
    for (const locale of Object.keys(branded.locales)) {
      for (const [brand, branch, expected] of [
        ['AROME', 'Central', 'AROME - Central'],
        ['AROME', '', 'AROME'],
        ['', 'Central', 'Provided name'],
        ['', '', 'Provided name'],
      ]) {
        const values = { 'brand.name': brand, branch, 'source.name': 'Provided name' }
        expect(renderLocalizedDisplayTemplate(branded, locale, values, '')).toBe(
          expected,
        )
        expect(renderLocalizedDisplayTemplate(plain, locale, values, '')).toBe(
          'Provided name',
        )
      }
    }
  })
})
