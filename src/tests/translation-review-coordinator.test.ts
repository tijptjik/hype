// @vitest-environment jsdom
import { get } from 'svelte/store'
import { expect, it, vi } from 'vitest'
import {
  translatingTab,
  acceptAllTranslationReview,
  registerTranslationReview,
  translationReviewTabs,
  completeTranslationReview,
  generateTranslationReview,
} from '#lib/forms/translationReview.js'

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

it('lists every affected tab, counts pending suggestions and switches only the owning form', () => {
  const form = document.createElement('form')
  const otherForm = document.createElement('form')
  const disposers: (() => void)[] = []
  const sections = ['core', 'fields', 'fields'].map((tab, index) => {
    const element = document.createElement('section')
    element.dataset.facetId = tab
    form.append(element)
    const section = {
      missing: () => true,
      missingKeys: () => (index === 0 ? [] : ['empty']),
      outstandingKeys: () => (index === 0 ? ['pending-suggestion'] : ['empty']),
      fingerprint: () => tab,
      open: vi.fn(),
      close: vi.fn(),
    }
    disposers.push(registerTranslationReview(form, section, element))
    return section
  })
  disposers.push(
    registerTranslationReview(otherForm, {
      missing: () => true,
      missingKeys: () => ['unrelated'],
      fingerprint: () => '',
      open: vi.fn(),
    }),
  )
  const tabs = translationReviewTabs(form)
  expect(tabs.map(({ id, count }) => [id, count])).toEqual([
    ['core', 1],
    ['fields', 2],
  ])
  tabs[1].open()
  expect(window.location.hash).toBe('#fields')
  expect(sections[1].open).toHaveBeenCalledOnce()
  expect(sections[0].close).toHaveBeenCalledOnce()
  expect(sections[2].close).toHaveBeenCalledOnce()
  for (const dispose of disposers) dispose()
  expect(translationReviewTabs(form)).toEqual([])
})

it('starts at the first displayed tab regardless of registration order and advances in that order', () => {
  const nav = document.createElement('nav')
  for (const id of ['core', 'location', 'fields']) {
    const button = document.createElement('button')
    button.dataset.facetRef = id
    nav.append(button)
  }
  document.body.append(nav)
  const form = document.createElement('form')
  const sections = ['fields', 'location', 'core'].map(id => {
    const anchor = document.createElement('section')
    anchor.dataset.facetId = id
    form.append(anchor)
    const section = {
      missing: () => true,
      missingKeys: () => [id],
      fingerprint: () => id,
      open: vi.fn(),
      close: vi.fn(),
    }
    return { section, dispose: registerTranslationReview(form, section, anchor) }
  })
  expect(form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))).toBe(
    false,
  )
  expect(sections[2].section.open).toHaveBeenCalledOnce()
  expect(translationReviewTabs(form).map(tab => tab.id)).toEqual([
    'core',
    'location',
    'fields',
  ])
  completeTranslationReview(form, sections[2].section)
  expect(sections[1].section.open).toHaveBeenCalledOnce()
  completeTranslationReview(form, sections[1].section)
  expect(sections[0].section.open).toHaveBeenCalledOnce()
  for (const item of sections) item.dispose()
  nav.remove()
})

it('generates all tabs in order and still reviews each before submitting', async () => {
  vi.useRealTimers()
  const form = document.createElement('form')
  form.requestSubmit = vi.fn()
  const events: string[] = []
  const entries = ['core', 'location', 'policies'].map(id => {
    const anchor = document.createElement('section')
    anchor.dataset.facetId = id
    form.append(anchor)
    let generated = false,
      accepted = false
    const section = {
      missing: () => !accepted,
      missingKeys: () => (generated || accepted ? [] : [id]),
      fingerprint: () => `${id}:${accepted}`,
      open: () => {
        events.push(`open:${id}`)
      },
      generate: async () => {
        expect(get(translatingTab)).toBe(id)
        events.push(`generate:${id}`)
        generated = true
      },
    }
    const dispose = registerTranslationReview(form, section, anchor)
    return {
      section,
      dispose,
      accept: () => {
        accepted = true
      },
    }
  })
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
  await generateTranslationReview(form, 'english')
  expect(get(translatingTab)).toBeNull()
  expect(events).toEqual([
    'open:core',
    'open:core',
    'generate:core',
    'open:location',
    'generate:location',
    'open:policies',
    'generate:policies',
    'open:core',
  ])
  expect(form.requestSubmit).not.toHaveBeenCalled()
  expect(form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))).toBe(
    false,
  )
  expect(form.requestSubmit).not.toHaveBeenCalled()
  entries[0].accept()
  completeTranslationReview(form, entries[0].section)
  expect(events.at(-1)).toBe('open:location')
  expect(form.requestSubmit).not.toHaveBeenCalled()
  entries[1].accept()
  completeTranslationReview(form, entries[1].section)
  expect(events.at(-1)).toBe('open:policies')
  entries[2].accept()
  completeTranslationReview(form, entries[2].section)
  expect(form.requestSubmit).toHaveBeenCalledOnce()
  for (const entry of entries) entry.dispose()
})

it('accepts all tabs with one action and resumes Save without visiting each tab', () => {
  const form = document.createElement('form')
  form.requestSubmit = vi.fn()
  const entries = ['core', 'location', 'policies'].map(id => {
    let missing = true
    const section = {
      missing: () => missing,
      fingerprint: () => id,
      open: vi.fn(),
      close: vi.fn(),
      acceptFilled: vi.fn(() => {
        missing = false
      }),
    }
    return { section, dispose: registerTranslationReview(form, section) }
  })
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
  expect(acceptAllTranslationReview(form)).toBe(true)
  expect(form.requestSubmit).toHaveBeenCalledOnce()
  for (const { section, dispose } of entries) {
    expect(section.acceptFilled).toHaveBeenCalledOnce()
    expect(section.close).toHaveBeenCalled()
    dispose()
  }
  expect(entries[1].section.open).not.toHaveBeenCalled()
  expect(entries[2].section.open).not.toHaveBeenCalled()
})

it('keeps genuinely untranslated fields in review after accepting available suggestions', () => {
  const form = document.createElement('form')
  form.requestSubmit = vi.fn()
  const section = {
    missing: () => true,
    fingerprint: () => 'untranslated',
    open: vi.fn(),
    acceptFilled: vi.fn(),
  }
  const dispose = registerTranslationReview(form, section)
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
  acceptAllTranslationReview(form)
  expect(form.requestSubmit).not.toHaveBeenCalled()
  expect(section.open).toHaveBeenCalledTimes(2)
  dispose()
})
