// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import Fixture from './fixtures/components/SharedLocationNameLocalesFixture.svelte'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.useRealTimers()
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
