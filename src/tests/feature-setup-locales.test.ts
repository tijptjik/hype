// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as m from '#lib/paraglide/messages.js'

describe('feature setup and location action translations', () => {
  it.each(['en', 'zh-hant', 'zh-hans'] as const)(
    'renders complete labels in %s',
    locale => {
      const options = { locale }
      const labels = [
        m.setup_map_question({}, options),
        m.setup_type_question({}, options),
        m.setup_find_location({}, options),
        m.setup_new_feature({}, options),
        m.location_create_here({}, options),
        m.location_use_existing({}, options),
        m.location_operating_period({}, options),
      ]
      expect(labels.every(label => label.trim().length > 0)).toBe(true)
      if (locale !== 'en')
        expect(labels.every(label => /[\u3400-\u9fff]/u.test(label))).toBe(true)
      const host = m.location_operates_in_named({ name: 'Host' }, options)
      expect(host).toContain('Host')
      expect(host).not.toContain('{name}')
      expect(m.setup_search_named_project({ name: 'Map' }, options)).toContain('Map')
    },
  )
})
