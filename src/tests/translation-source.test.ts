// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { translationSource } from '#lib/forms/translationSource.js'
describe('hub translation source selection', () => {
  it('prefers Chinese, Japanese, Korean, English, then European sources for Chinese', () => {
    const sources = ['th', 'fr', 'en', 'ko', 'ja', 'zh-Hans']
    expect(translationSource('zh-Hant', sources, 'nearest')).toBe('zh-Hans')
    expect(translationSource('zh-Hant', sources.slice(0, -1), 'nearest')).toBe('ja')
    expect(translationSource('zh-Hant', sources.slice(0, -2), 'nearest')).toBe('ko')
    expect(translationSource('zh-Hant', sources.slice(0, -3), 'nearest')).toBe('en')
    expect(translationSource('zh-Hant', sources.slice(0, -4), 'nearest')).toBe('fr')
  })
  it('prefers European sources over Chinese, then Traditional over Simplified', () => {
    expect(translationSource('en', ['ja', 'zh-Hans', 'zh-Hant', 'fr'], 'nearest')).toBe(
      'fr',
    )
    expect(translationSource('en', ['ja', 'zh-Hans', 'zh-Hant'], 'nearest')).toBe(
      'zh-Hant',
    )
    expect(translationSource('de', ['ja', 'zh-Hans', 'fr'], 'nearest')).toBe('fr')
    expect(translationSource('en', ['ja', 'zh-Hans'], 'nearest')).toBe('zh-Hans')
    expect(translationSource('en', ['ja', 'zh-CN', 'zh-TW'], 'nearest')).toBe('zh-TW')
  })
  it('falls back when explicit English is missing and never translates a locale from itself', () => {
    expect(translationSource('zh-Hant', ['ja', 'en'], 'english')).toBe('en')
    expect(translationSource('zh-Hant', ['ja'], 'english')).toBe('ja')
    expect(translationSource('en', ['zh-Hans', 'zh-Hant'], 'english')).toBe('zh-Hant')
    expect(translationSource('en', ['en'], 'nearest')).toBeUndefined()
    expect(translationSource('zh-Hant', ['zhHant', 'en'], 'nearest')).toBe('en')
  })
})
