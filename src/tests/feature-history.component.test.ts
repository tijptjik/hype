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

it('resolves user actors to profile links without toggling the comparison', async () => {
  const loadReview = vi.fn()
  render(FeaturePublicationHistory, {
    entries: [
      {
        ...entry,
        actorName: 'History Editor',
        actorUsername: 'history.editor',
        actorDisplayUsername: 'History.Editor',
      },
    ],
    canReview: true,
    loadReview,
  })
  const actor = screen.getByRole('link', { name: '@History.Editor' })
  expect(actor.getAttribute('href')).toBe('/admin/users/history.editor')
  await fireEvent.click(actor)
  expect(loadReview).not.toHaveBeenCalled()
})

it('falls back to the recorded ID when the user no longer exists', () => {
  render(FeaturePublicationHistory, {
    entries: [entry],
    canReview: false,
    loadReview: vi.fn(),
  })
  expect(screen.getByText('editor')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})

it('renders multilingual photo metadata as two fields with locale comparison rows', async () => {
  const changes = ['alt', 'caption'].flatMap(field =>
    ['en', 'zh-Hans', 'zh-Hant'].map(locale => ({
      path: ['gallery', 'entries', 'photo', field, locale],
      before: { present: false as const },
      after: { present: true as const, value: `${field} ${locale}` },
    })),
  )
  render(FeaturePublicationHistory, {
    entries: [entry],
    canReview: true,
    loadReview: vi.fn().mockResolvedValue({ changes, redacted: false }),
  })
  await fireEvent.click(screen.getByRole('button', { name: 'View changes' }))
  expect(await screen.findByRole('button', { name: '2 changed fields' })).toBeTruthy()
  expect(screen.getAllByRole('table')).toHaveLength(2)
  expect(screen.getAllByRole('columnheader', { name: 'Locale' })).toHaveLength(2)
  expect(screen.getAllByRole('rowheader', { name: 'zh-Hant' })).toHaveLength(2)
  expect(screen.getByText('caption zh-Hant')).toBeTruthy()
})

it('searches unopened comparison values and restores collapsed cards when cleared', async () => {
  const { HeaderCtrl, HEADER_CTRL_KEY } = await import('#lib/context/header.svelte.js')
  const { tick } = await import('svelte')
  const header = new HeaderCtrl()
  const loadReview = vi.fn().mockResolvedValue(review)
  render(FeaturePublicationHistory, {
    props: { entries: [entry], canReview: true, loadReview },
    context: new Map([[HEADER_CTRL_KEY, header]]),
  })
  header.historyQuery = 'old NAME'
  expect(await screen.findByText('Old name')).toBeTruthy()
  expect(loadReview).toHaveBeenCalledTimes(1)
  expect(
    screen
      .getByRole('button', { name: '1 changed field' })
      .getAttribute('aria-expanded'),
  ).toBe('true')
  header.historyQuery = 'missing value'
  expect(await screen.findByText('No matches in loaded history.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '1 changed field' })).toBeNull()
  header.historyQuery = ''
  await tick()
  expect(
    screen
      .getByRole('button', { name: '1 changed field' })
      .getAttribute('aria-expanded'),
  ).toBe('false')
  expect(loadReview).toHaveBeenCalledTimes(1)
})

it('loads authorized comparisons for action filtering without requiring text search', async () => {
  const { HeaderCtrl, HEADER_CTRL_KEY } = await import('#lib/context/header.svelte.js')
  const header = new HeaderCtrl()
  header.historyFilters = { action: 'added' }
  const loadReview = vi.fn().mockResolvedValue(review)
  render(FeaturePublicationHistory, {
    props: { entries: [entry], canReview: true, loadReview },
    context: new Map([[HEADER_CTRL_KEY, header]]),
  })
  expect(await screen.findByText('No matches in loaded history.')).toBeTruthy()
  expect(loadReview).toHaveBeenCalledTimes(1)
  header.historyFilters = { action: 'updated' }
  expect(await screen.findByRole('button', { name: '1 changed field' })).toBeTruthy()
  expect(screen.getByText('New name')).toBeTruthy()
})
