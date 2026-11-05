// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { query, refresh } = vi.hoisted(() => ({
  query: vi.fn(),
  refresh: vi.fn((value: unknown) => value),
}))
vi.mock('#lib/api/organisationHistory.remote.js', () => ({
  getOrganisationHistory: query,
}))
vi.mock('#lib/remote/index.js', () => ({ refreshRemoteQuery: refresh }))
import OrganisationHistory from '#lib/bits/patterns/revisionHistory/OrganisationHistory.svelte'

const entry = {
  id: 'revision',
  actorId: 'editor',
  origin: 'user',
  reason: 'Translation corrected',
  createdAt: '2026-11-05T10:00:00.000Z',
  initial: false,
  previousCreatedAt: '2026-11-05T08:00:00.000Z',
  changes: [
    {
      path: ['i18n', 'en', 'name'],
      before: { present: true, value: 'Old name' },
      after: { present: true, value: 'New name' },
    },
  ],
}
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
afterEach(cleanup)

it('shows comparisons, loads older entries and clears evidence after access failure', async () => {
  query
    .mockResolvedValueOnce({ available: true, entries: [entry], nextCursor: 5 })
    .mockResolvedValueOnce({
      available: true,
      entries: [
        {
          ...entry,
          id: 'baseline',
          initial: true,
          origin: 'migration',
          reason: 'Initial capture',
          changes: [],
        },
      ],
      nextCursor: null,
    })
    .mockRejectedValueOnce(new Error('Forbidden'))
  render(OrganisationHistory, { organisationId: 'o' })
  await screen.findByText('Translation corrected')
  expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  await fireEvent.click(screen.getByText('1 changed field'))
  expect(screen.getByText('Old name')).toBeTruthy()
  expect(screen.getByText('New name')).toBeTruthy()
  await fireEvent.click(screen.getByText('Older changes'))
  await screen.findByText('Initial capture')
  expect(query).toHaveBeenLastCalledWith({ organisationId: 'o', before: 5 })
  await fireEvent.click(
    screen.getByRole('button', { name: 'Field definitions', exact: true }),
  )
  await screen.findByRole('alert')
  expect(screen.queryByText('Translation corrected')).toBeNull()
  expect(screen.queryByText('Old name')).toBeNull()
})

it('distinguishes unavailable tracking from empty recorded history', async () => {
  query
    .mockResolvedValueOnce({ available: false, entries: [], nextCursor: null })
    .mockResolvedValueOnce({ available: true, entries: [], nextCursor: null })
  render(OrganisationHistory, { organisationId: 'o' })
  await screen.findByText('History tracking is not yet enabled.')
  await fireEvent.click(
    screen.getByRole('button', { name: 'Field definitions', exact: true }),
  )
  await screen.findByText('No recorded changes yet. Earlier edits are not available.')
})

it('ignores an old request after switching organisation', async () => {
  let resolveOld!: (value: unknown) => void
  query
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce({ available: true, entries: [], nextCursor: null })
  const view = render(OrganisationHistory, { organisationId: 'o' })
  await waitFor(() => expect(query).toHaveBeenCalledTimes(1))
  await view.rerender({ organisationId: 'other' })
  await screen.findByText('No recorded changes yet. Earlier edits are not available.')
  resolveOld({ available: true, entries: [entry], nextCursor: null })
  await Promise.resolve()
  expect(screen.queryByText('Translation corrected')).toBeNull()
})

it('opens the latest comparison, exposes elapsed time and toggles all changes', async () => {
  query.mockResolvedValueOnce({ available: true, entries: [entry], nextCursor: null })
  render(OrganisationHistory, { organisationId: 'o' })
  await screen.findByText('2 hours since previous version')
  const disclosure = screen.getByRole('button', { name: /1 changed field/ })
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('Old name').closest('[hidden]')).toBeNull()
  expect(screen.getByText(/ago|in .*hours/).getAttribute('datetime')).toBe(
    entry.createdAt,
  )
  await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
  expect(disclosure.getAttribute('aria-expanded')).toBe('false')
  await fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
})

it('switches to field definitions without retaining profile entries', async () => {
  query
    .mockResolvedValueOnce({ available: true, entries: [entry], nextCursor: 5 })
    .mockResolvedValueOnce({
      available: true,
      entries: [{ ...entry, id: 'catalog', reason: 'Field definitions updated' }],
      nextCursor: null,
    })
  render(OrganisationHistory, { organisationId: 'o' })
  await screen.findByText('Translation corrected')
  await fireEvent.click(
    screen.getByRole('button', { name: 'Field definitions', exact: true }),
  )
  await screen.findByText('Field definitions updated')
  expect(screen.queryByText('Translation corrected')).toBeNull()
  expect(query).toHaveBeenLastCalledWith({
    organisationId: 'o',
    before: undefined,
    kind: 'fields',
  })
  expect(
    screen
      .getByRole('button', { name: 'Field definitions', exact: true })
      .getAttribute('aria-pressed'),
  ).toBe('true')
})
