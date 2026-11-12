import { describe, expect, it } from 'vitest'
import {
  shouldPromptMissingTranslations,
  translationPromptAttributes,
} from '#lib/forms/translationReview.js'
import {
  applyOrganisationSettingsPatch,
  toOrganisationSettingsForm,
} from '#lib/organisations/settings.js'

const since = '2026-11-12T10:00:00.000Z'
const saved = '2026-11-12T11:00:00.000Z'
const baseline = new Set(['name:zh-Hant'])

describe('translation prompt once', () => {
  it('still prompts when disabled, before activation, or on a new record', () => {
    for (const [activation, revision] of [
      [undefined, saved],
      [since, undefined],
      [since, '2026-11-11T00:00:00Z'],
    ]) {
      expect(
        shouldPromptMissingTranslations(activation, revision, baseline, [...baseline]),
      ).toBe(true)
    }
  })
  it('ignores unchanged gaps but asks about cleared values and newly added locales', () => {
    expect(shouldPromptMissingTranslations(since, saved, baseline, [...baseline])).toBe(
      false,
    )
    expect(
      shouldPromptMissingTranslations(since, saved, baseline, [
        ...baseline,
        'description:en',
      ]),
    ).toBe(true)
    expect(
      shouldPromptMissingTranslations(since, saved, baseline, [...baseline, 'name:ja']),
    ).toBe(true)
    expect(shouldPromptMissingTranslations(since, saved, baseline, [])).toBe(false)
    expect(
      shouldPromptMissingTranslations(
        since,
        saved,
        new Set(['name:zh-Hant:unconfirmed']),
        ['name:zh-Hant:empty'],
      ),
    ).toBe(true)
  })
  it('stores a server-owned activation boundary and preserves it across ordinary saves', () => {
    const enabled = applyOrganisationSettingsPatch(
      { futureSetting: 'retained' },
      { translationPromptOnce: true },
    )
    expect(enabled.translationPromptOnceSince).toEqual(expect.any(String))
    expect(enabled.futureSetting).toBe('retained')
    expect(
      applyOrganisationSettingsPatch(enabled, { translationPromptOnce: true }),
    ).toEqual(enabled)
    expect(toOrganisationSettingsForm(enabled)).toEqual({ translationPromptOnce: true })
    expect(
      applyOrganisationSettingsPatch(enabled, { translationPromptOnce: false })
        .translationPromptOnceSince,
    ).toBeUndefined()
    expect(
      translationPromptAttributes(enabled, saved)['data-translation-prompt-once-since'],
    ).toBe(enabled.translationPromptOnceSince)
    expect(
      translationPromptAttributes({ ...enabled, translationPromptOnce: false }, saved)[
        'data-translation-prompt-once-since'
      ],
    ).toBeUndefined()
  })
})
