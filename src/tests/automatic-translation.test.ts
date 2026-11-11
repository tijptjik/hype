// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  contentLocaleOrder,
  resolveContentField,
  translationSourceHash,
} from '#lib/i18n/automatic.js'

describe('published and automatic content resolution', () => {
  it('preserves Chinese/English order and appends additional languages stably', () => {
    expect(contentLocaleOrder('zhHans', ['fr', 'ja', 'en'])).toEqual([
      'zh-Hans',
      'zh-Hant',
      'en',
      'fr',
      'ja',
    ])
    expect(contentLocaleOrder('zh-Hant')).toEqual(['zh-Hant', 'zh-Hans', 'en'])
    expect(contentLocaleOrder('zh-TW')).toEqual(['zh-TW', 'zh-Hant', 'zh-Hans', 'en'])
    expect(contentLocaleOrder('zh-CN')).toEqual(['zh-CN', 'zh-Hans', 'zh-Hant', 'en'])
    expect(contentLocaleOrder('en')).toEqual(['en', 'zh-Hant', 'zh-Hans'])
    expect(contentLocaleOrder('pt-BR')).toEqual(['pt-BR', 'en', 'zh-Hant', 'zh-Hans'])
  })
  it('uses any published language and resolves fields independently', () => {
    const rows = {
      zhHans: { title: '简体', description: '' },
      fr: { title: 'Français', description: 'Description' },
    }
    expect(resolveContentField(rows, 'title', 'en').value).toBe('简体')
    expect(resolveContentField(rows, 'description', 'en').value).toBe('Description')
  })
  it('uses requested-language automatic text only after opt-in and before published fallback', async () => {
    const automatic = {
      value: 'Bonjour',
      sourceLocale: 'en',
      sourceText: 'Hello',
      sourceHash: await translationSourceHash('Hello'),
      provider: 'azure',
      model: null,
      generatedAt: new Date().toISOString(),
    }
    const rows = {
      en: { title: 'Hello' },
      fr: { autoTranslated: { title: automatic } },
    }
    expect(resolveContentField(rows, 'title', 'fr')).toMatchObject({
      value: 'Hello',
      kind: 'published',
    })
    expect(resolveContentField(rows, 'title', 'fr', true)).toMatchObject({
      value: 'Bonjour',
      kind: 'automatic',
      original: { value: 'Hello', locale: 'en' },
    })
    expect(
      resolveContentField(
        { ...rows, fr: { ...rows.fr, title: 'Salut' } },
        'title',
        'fr',
        true,
      ).value,
    ).toBe('Salut')
    expect(resolveContentField(rows, 'title', 'ja', true).value).toBe('Hello')
    expect(
      resolveContentField({ ...rows, en: { title: 'Changed' } }, 'title', 'fr', true)
        .value,
    ).toBe('Changed')
  })
  it('does not publish legacy generated text or mistake the false string for generation', () => {
    expect(
      resolveContentField(
        {
          en: { title: 'AI', titleGen: true },
          ja: { title: '日本語', titleGen: 'false' },
        },
        'title',
        'en',
      ).value,
    ).toBe('日本語')
  })
})
