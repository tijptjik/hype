// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  ContentLocaleSettingsSchema,
  ContentLocaleSettingsFormSchema,
  applyContentLocaleSettingsPatch,
  toContentLocaleSettingsForm,
} from '#lib/content-locales/settings.js'
import { resolveMultilingualDefaults } from '#lib/content-locales/resolve.js'
import { FeatureMultilingualState } from '#lib/context/featureMultilingual.svelte.js'
import MultilingualDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/MultilingualDefaults.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('round-trips independent booleans, preserves false and unrelated settings, and resets per key', () => {
  const org = applyContentLocaleSettingsPatch(
    ContentLocaleSettingsSchema.parse({ contentLocales: ['ja'], other: 'keep' }),
    { multilingualContent: true, multilingualAddresses: true },
  )
  const patch = ContentLocaleSettingsFormSchema.parse(
    JSON.stringify({ multilingualContent: false }),
  )
  const project = applyContentLocaleSettingsPatch({ other: 'keep' }, patch)
  expect(
    resolveMultilingualDefaults({
      organisationSettings: org,
      projectSettings: project,
    }),
  ).toEqual({ content: false, addresses: true })
  expect(toContentLocaleSettingsForm(project)).toEqual({ multilingualContent: false })
  const reloaded = ContentLocaleSettingsSchema.parse(
    JSON.parse(JSON.stringify(project)),
  )
  expect(reloaded).toEqual({ other: 'keep', multilingualContent: false })
  const reset = applyContentLocaleSettingsPatch(reloaded, { multilingualContent: null })
  expect(reset).toEqual({ other: 'keep' })
  expect(
    resolveMultilingualDefaults({ organisationSettings: org, projectSettings: reset }),
  ).toEqual({ content: true, addresses: true })
  expect(resolveMultilingualDefaults()).toEqual({ content: false, addresses: false })
  expect(
    ContentLocaleSettingsFormSchema.safeParse({ multilingualContent: 'false' }).success,
  ).toBe(false)
})

it('retains an explicit mode across records while isolating accounts and default-only reads', () => {
  const session = new FeatureMultilingualState()
  expect(session.get('a')).toBeUndefined()
  session.set('a', true)
  for (const _feature of ['next', 'previous', 'another-project'])
    expect(session.get('a')).toBe(true)
  expect(session.get('b')).toBeUndefined()
  session.set('b', false)
  expect(session.get('b')).toBe(false)
  expect(session.get('a')).toBeUndefined()
})

it('shows inherited defaults without writing and supports an explicit false override and reset', async () => {
  const onChange = vi.fn()
  const view = render(MultilingualDefaults, {
    value: {},
    inherited: { multilingualContent: true, multilingualAddresses: false },
    scope: 'project',
    onChange,
  })
  expect(onChange).not.toHaveBeenCalled()
  await view.rerender({
    value: { multilingualContent: true, multilingualAddresses: false },
  })
  expect(view.queryByRole('button', { name: 'Reset to defaults' })).toBeNull()
  const content = view.getByRole('switch', {
    name: 'Always show content translations',
  })
  expect(content.getAttribute('aria-checked')).toBe('true')
  expect(
    view
      .getByRole('switch', { name: 'Always show address translations' })
      .getAttribute('aria-checked'),
  ).toBe('false')
  await fireEvent.click(content)
  expect(onChange).toHaveBeenLastCalledWith({ multilingualContent: false })
  await view.rerender({ value: { multilingualContent: false } })
  await fireEvent.click(view.getByRole('button', { name: 'Reset to defaults' }))
  expect(onChange).toHaveBeenLastCalledWith({ multilingualContent: null })
  await view.rerender({
    value: {},
    inherited: { multilingualContent: false, multilingualAddresses: true },
  })
  expect(content.getAttribute('aria-checked')).toBe('false')
  expect(
    view
      .getByRole('switch', { name: 'Always show address translations' })
      .getAttribute('aria-checked'),
  ).toBe('true')
})
