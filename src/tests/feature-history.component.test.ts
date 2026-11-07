// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import FeaturePublicationHistory from '#lib/bits/patterns/revisionHistory/FeaturePublicationHistory.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
const entry = {
  generation: 2,
  revisionId: 'revision',
  actorId: 'editor',
  origin: 'user',
  reason: 'Name corrected',
  createdAt: '2026-11-06T10:00:00Z',
}
const review = {
  changes: [
    {
      path: ['translations', 'en', 'title'],
      before: { present: true as const, value: 'Old name' },
      after: { present: true as const, value: 'New name' },
    },
  ],
  redacted: true,
}

it('loads comparisons on disclosure and retains restricted-field notices', async () => {
  const loadReview = vi.fn().mockResolvedValue(review)
  render(FeaturePublicationHistory, { entries: [entry], canReview: true, loadReview })
  expect(loadReview).not.toHaveBeenCalled()
  expect(screen.getByText('Latest')).toBeTruthy()
  const button = screen.getByRole('button', { name: 'View changes' })
  await fireEvent.click(button)
  expect(await screen.findByText('Old name')).toBeTruthy()
  expect(screen.getByText('New name')).toBeTruthy()
  expect(
    screen.getByText('Some changes are restricted by your current field permissions.'),
  ).toBeTruthy()
  await fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  await fireEvent.click(button)
  expect(loadReview).toHaveBeenCalledTimes(1)
})

it('does not offer comparisons without publication-review permission', () => {
  const loadReview = vi.fn()
  render(FeaturePublicationHistory, { entries: [entry], canReview: false, loadReview })
  fireEvent.click(screen.getByText('Name corrected'))
  expect(screen.queryByRole('button')).toBeNull()
  expect(loadReview).not.toHaveBeenCalled()
})

it('allows retry after a failed comparison without hiding the timeline', async () => {
  const loadReview = vi
    .fn()
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValue(review)
  render(FeaturePublicationHistory, { entries: [entry], canReview: true, loadReview })
  await fireEvent.click(screen.getByRole('button', { name: 'View changes' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('Name corrected')).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('New name')).toBeTruthy()
})

it('toggles the card surface while preserving controls and selected text', async () => {
  const loadReview = vi.fn().mockResolvedValue(review)
  render(FeaturePublicationHistory, { entries: [entry], canReview: true, loadReview })
  const button = screen.getByRole('button', { name: 'View changes' })
  await fireEvent.click(screen.getByText('Name corrected'))
  expect(await screen.findByText('Old name')).toBeTruthy()
  expect(button.getAttribute('aria-expanded')).toBe('true')
  await fireEvent.click(screen.getByText('Old name'))
  expect(button.getAttribute('aria-expanded')).toBe('false')
  await fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  const selection = vi
    .spyOn(window, 'getSelection')
    .mockReturnValue({ isCollapsed: false } as Selection)
  try {
    await fireEvent.click(screen.getByText('Name corrected'))
    expect(button.getAttribute('aria-expanded')).toBe('true')
  } finally {
    selection.mockRestore()
  }
  expect(loadReview).toHaveBeenCalledTimes(1)
})
