// @vitest-environment jsdom
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// CLIENT
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { createDevFormDraft } from '#lib/client/devFormDraft.js'

const environment = vi.hoisted(() => ({ BROWSER: true }))
vi.mock('esm-env', () => environment)

beforeEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  environment.BROWSER = true
  vi.stubEnv('DEV', true)
})

it('round-trips incomplete form progress across store instances and isolates accounts', () => {
  const progress = {
    data: { title: '', phone: '+' },
    facet: 'location',
    accepted: true,
  }
  createDevFormDraft('form:user-a').write(progress)
  expect(createDevFormDraft('form:user-a').read()).toEqual(progress)
  expect(createDevFormDraft('form:user-b').read()).toBeNull()
  createDevFormDraft('form:user-a').clear()
  expect(createDevFormDraft('form:user-a').read()).toBeNull()
})

it.each([
  { browser: true, dev: false },
  { browser: false, dev: true },
])('never accesses storage outside browser development: %j', settings => {
  environment.BROWSER = settings.browser
  vi.stubEnv('DEV', settings.dev)
  const read = vi.spyOn(Storage.prototype, 'getItem')
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const clear = vi.spyOn(Storage.prototype, 'removeItem')
  const store = createDevFormDraft('form')
  expect(store.read()).toBeNull()
  store.write({ title: 'Test' })
  store.clear()
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  expect(clear).not.toHaveBeenCalled()
})

it('ignores corrupt and incompatible checkpoints and tolerates unavailable storage', () => {
  const store = createDevFormDraft('form')
  for (const value of [
    '{broken',
    'null',
    '{"version":0,"value":{}}',
    '{"version":1,"value":4}',
  ]) {
    sessionStorage.setItem('form', value)
    expect(store.read()).toBeNull()
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(store.read()).toBeNull()
  expect(() => store.write({ title: 'Test' })).not.toThrow()
  expect(() => store.clear()).not.toThrow()
})

it('keeps draft reads, writes and resets separate from shared local storage', () => {
  const sharedDraft = JSON.stringify({ version: 1, value: { title: 'Other window' } })
  localStorage.setItem('form', sharedDraft)
  const store = createDevFormDraft<{ title: string }>('form')
  expect(store.read()).toBeNull()
  store.write({ title: 'This tab' })
  expect(store.read()).toEqual({ title: 'This tab' })
  expect(localStorage.getItem('form')).toBe(sharedDraft)
  store.clear()
  expect(sessionStorage.getItem('form')).toBeNull()
  expect(localStorage.getItem('form')).toBe(sharedDraft)
})

it('recovers all fourth-locale values and verification independently of hidden Profile rows', () => {
  const progress = {
    data: {
      i18n: {
        en: { title: 'Place', titleGen: false },
        ja: {
          title: '場所',
          titleGen: false,
          description: '<p>説明</p>',
          descriptionGen: true,
        },
      },
      properties: [
        { propertyId: 'note', i18n: { ja: { value: '追加情報', valueGen: false } } },
      ],
    },
    profileLocales: {
      selectedLocales: ['ja', 'en'],
      visibleLocales: ['en'],
      expanded: true,
    },
    facet: 'location',
  }
  createDevFormDraft('profile-fourth-locale').write(progress)
  const restored = createDevFormDraft<typeof progress>('profile-fourth-locale').read()!
  expect(restored).toEqual(progress)
  expect(
    restoreProfileLocales(
      ['en', 'zh-Hant', 'zh-Hans'],
      restored.data.i18n,
      restored.profileLocales,
    ),
  ).toEqual(progress.profileLocales)
})
