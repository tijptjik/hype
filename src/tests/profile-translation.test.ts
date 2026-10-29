import { expect, it, vi } from 'vitest'
import { createProfileTranslator, hasProfileText, type ProfileProviderResult } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'

function setup() {
  const values: Record<string, { title?: string; description?: string; descriptionGen?: boolean }> = {
    en: { title: 'Original title', description: '<p>Source</p>', descriptionGen: false },
    zhHant: { title: 'Keep', description: 'Existing', descriptionGen: false },
    zhHans: { description: '<p><br></p>', descriptionGen: false }, ja: { description: '' },
  }
  let context = 'one'
  let locked = false
  const translate = vi.fn(async (_source: string, target: string, _text: string): Promise<ProfileProviderResult> => ({ status: 'translated', text: target }))
  const apply = vi.fn((field: 'title' | 'description', locale: string, text: string) => {
    const key = contentFormKey(locale)
    values[key] = { ...values[key], [field]: text, [`${field}Gen`]: true }
  })
  const controller = createProfileTranslator({ values: () => values, context: () => context, locked: () => locked, translate, apply })
  return { values, translate, apply, controller, setContext: () => context = 'two', lock: () => locked = true }
}
const selected = ['en', 'zh-Hant', 'zh-Hans', 'ja']
function pending() {
  let resolve!: (value: ProfileProviderResult) => void
  return { promise: new Promise<ProfileProviderResult>(r => resolve = r), resolve: (text = 'Result') => resolve({ status: 'translated', text }) }
}
it('fills every empty selected target including hidden Japanese, preserving populated values, flags and other fields', async () => {
  const s = setup()
  expect(await s.controller.run('en', 'description', selected)).toEqual([{ locale: 'zh-Hans', status: 'translated' }, { locale: 'ja', status: 'translated' }])
  expect(s.values.en).toEqual({ title: 'Original title', description: '<p>Source</p>', descriptionGen: false })
  expect(s.values.zhHant).toEqual({ title: 'Keep', description: 'Existing', descriptionGen: false })
  expect(s.values.ja).toEqual({ description: 'ja', descriptionGen: true })
  expect(s.translate).toHaveBeenCalledTimes(2)
})
it('retains partial successes, handles unsupported and rejected requests, retries only remaining empties', async () => {
  const s = setup()
  s.translate.mockImplementationOnce(async () => ({ status: 'unsupported', message: 'pair' }))
  const result = await s.controller.run('en', 'description', selected)
  expect(result.map(r => r.status)).toEqual(['unsupported', 'translated'])
  s.translate.mockRejectedValueOnce(new Error('provider'))
  expect(await s.controller.run('en', 'description', selected)).toEqual([{ locale: 'zh-Hans', status: 'error' }])
  expect(s.values.zhHans.descriptionGen).toBe(false)
  await s.controller.run('en', 'description', selected)
  expect(s.translate).toHaveBeenCalledTimes(4)
  expect(s.values.ja.description).toBe('ja')
})
for (const change of ['target', 'source', 'context', 'lock', 'cancel', 'empty-edit', 'source-reverted'] as const) {
  it(`rejects stale responses after ${change}`, async () => {
    const s = setup(); const request = pending()
    s.translate.mockImplementation(() => request.promise)
    const job = s.controller.run('en', 'description', selected)
    if (change === 'target') { s.values.zhHans.description = 'Human'; s.values.ja.description = 'Human' }
    if (change === 'source') s.values.en.description = 'Changed'
    if (change === 'context') s.setContext()
    if (change === 'lock') s.lock()
    if (change === 'cancel') s.controller.cancel()
    if (change === 'empty-edit') { s.controller.touch('ja', 'description'); s.controller.touch('zh-Hans', 'description') }
    if (change === 'source-reverted') s.controller.touch('en', 'description')
    request.resolve(); await job
    expect(s.apply).not.toHaveBeenCalled()
  })
}
it('excludes locked fields and deduplicates in-flight clicks with bounded concurrency', async () => {
  const s = setup(); const request = pending()
  s.translate.mockImplementation(() => request.promise)
  const job = s.controller.run('en', 'description', [...selected, 'fr', 'de', 'es'])
  expect(s.translate).toHaveBeenCalledTimes(3)
  expect(await s.controller.run('en', 'description', selected)).toEqual([])
  request.resolve(); await job
  expect(s.translate).toHaveBeenCalledTimes(5)
  s.lock(); await s.controller.run('en', 'title', selected)
  expect(s.translate).toHaveBeenCalledTimes(5)
})
it('does not treat markup, nonbreaking spaces or empty provider results as translations', async () => {
  expect(hasProfileText('<p>&nbsp;\u200b<br></p>')).toBe(false)
  const s = setup(); s.translate.mockResolvedValue({ status: 'translated', text: '<p></p>' })
  await s.controller.run('en', 'description', selected)
  expect(s.apply).not.toHaveBeenCalled()
})
it('restores dynamic draft order and hidden values without pinning the user locale', () => {
  const state = restoreProfileLocales(['en', 'zh-Hant'], { ja: { title: '日本語' }, fr: { description: 'Texte' } }, { selectedLocales: ['ja', 'en', 'zhHant'], visibleLocales: ['en'], expanded: true })
  expect(state).toEqual({ selectedLocales: ['ja', 'en', 'zh-Hant', 'fr'], visibleLocales: ['en', 'fr'], expanded: true })
})
