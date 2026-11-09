// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
import Fixture from './fixtures/components/SharedLocationNameLocalesFixture.svelte'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'

afterEach(() => {
  cleanup()
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.useRealTimers()
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})

it('carries empty Profile languages into Location, retains stored names, and collapses to the selected first language', async () => {
  const view = render(Fixture)
  expect(view.getByText('Fil')).toBeTruthy()
  expect(view.getByText('パン屋')).toBeTruthy()
  await fireEvent.click(view.getAllByRole('button', { name: 'Name' })[0])
  await fireEvent.input(view.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Padaria' },
  })
  expect(JSON.parse(view.getByTestId('names').textContent!)).toEqual({
    en: 'Bakery',
    ja: 'パン屋',
    pt: 'Padaria',
  })
  await fireEvent.click(view.getByRole('button', { name: 'Toggle languages' }))
  await waitFor(() => expect(view.queryByText('パン屋')).toBeNull())
  expect(view.getByRole('textbox').getAttribute('id')).toBe('draft-location-name-pt')
})

it('loads project defaults above organisation defaults and appends only populated feature locales', () => {
  const defaults = resolveContentLocales({
    userLocale: 'en',
    organisationSettings: { contentLocales: normalizeContentLocales(['zh-Hant']) },
    projectSettings: { contentLocales: normalizeContentLocales(['pt', 'en']) },
  })
  expect(
    restoreProfileLocales(defaults.locales, {
      ja: { title: 'パン屋' },
      fil: { description: ' ' },
      fr: { description: 'Boulangerie' },
    }).selectedLocales,
  ).toEqual(['pt', 'en', 'fr', 'ja'])
  expect(
    resolveContentLocales({
      userLocale: 'en',
      organisationSettings: { contentLocales: normalizeContentLocales(['zh-Hant']) },
    }).locales,
  ).toEqual(['zh-Hant'])
})

it('omits a legacy undetermined name and locale selection from location rows', () => {
  const view = render(DraftLocationNameFields, {
    names: {
      en: 'Golden Gate Commercial Building',
      'zh-hant': '金門商業大廈',
      und: 'Combined legacy title',
    },
    translations: true,
    kind: 'building',
    isEditing: false,
    localeState: {
      selectedLocales: ['und', 'en', 'zh-Hant'],
      visibleLocales: ['und', 'en', 'zh-Hant'],
      expanded: true,
    },
    onChange: () => {},
  })
  expect(view.queryByText('Und')).toBeNull()
  expect(view.queryByText('Combined legacy title')).toBeNull()
  expect(view.getByText('Golden Gate Commercial Building')).toBeTruthy()
  expect(view.getByText('金門商業大廈')).toBeTruthy()
})
