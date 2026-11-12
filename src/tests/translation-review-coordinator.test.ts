// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { registerTranslationReview } from '#lib/forms/translationReview.js'

it('skips baseline gaps but intercepts newly cleared fields and refreshes after save', async () => {
  const form = document.createElement('form')
  form.dataset.translationPromptOnceSince = '2026-11-12T10:00:00Z'
  form.dataset.translationBaselineModified = '2026-11-12T11:00:00Z'
  let missing = ['name:zh-Hant']
  const open = vi.fn()
  const dispose = registerTranslationReview(form, {
    fingerprint: () => JSON.stringify(missing),
    missing: () => missing.length > 0,
    missingKeys: () => missing,
    open,
  })
  await Promise.resolve()
  const submit = () =>
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
  expect(submit()).toBe(true)
  expect(open).not.toHaveBeenCalled()
  missing = [...missing, 'description:en']
  expect(submit()).toBe(false)
  expect(open).toHaveBeenCalledOnce()
  form.dataset.translationBaselineModified = '2026-11-12T12:00:00Z'
  await Promise.resolve()
  expect(submit()).toBe(true)
  missing = [...missing, 'name:ja']
  expect(submit()).toBe(false)
  dispose()
})

it('captures nested tab membership after the mount flush', async () => {
  const form = document.createElement('form')
  form.dataset.translationPromptOnceSince = '2026-11-12T10:00:00Z'
  form.dataset.translationBaselineModified = '2026-11-12T11:00:00Z'
  let missing: string[] = []
  const open = vi.fn()
  const dispose = registerTranslationReview(form, {
    fingerprint: () => JSON.stringify(missing),
    missing: () => !!missing.length,
    missingKeys: () => missing,
    open,
  })
  missing = ['property-a:label:zh-Hant']
  await Promise.resolve()
  expect(form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))).toBe(true)
  missing.push('property-new:label:zh-Hant')
  expect(form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))).toBe(
    false,
  )
  dispose()
})

it('saves filled AI suggestions across tabs without opening a missing-value prompt', () => {
  const form = document.createElement('form')
  const open = vi.fn()
  const acceptFilled = vi.fn()
  const dispose = ['profile', 'policies', 'fields'].map(tab =>
    registerTranslationReview(form, {
      fingerprint: () => tab,
      missing: () => true,
      missingKeys: () => [],
      acceptFilled,
      open,
    }),
  )
  expect(form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))).toBe(true)
  expect(open).not.toHaveBeenCalled()
  expect(acceptFilled).toHaveBeenCalledTimes(3)
  for (const cleanup of dispose) cleanup()
})
