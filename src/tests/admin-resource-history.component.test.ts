// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('#lib/api/adminResourceHistory.remote.js', () => ({
  getAdminResourceHistory: query,
}))
vi.mock('#lib/remote/index.js', () => ({
  refreshRemoteQuery: (value: unknown) => value,
}))
import AdminResourceHistory from '#lib/bits/patterns/revisionHistory/AdminResourceHistory.svelte'
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
afterEach(cleanup)
it.each(['project', 'layer', 'hub'] as const)(
  'renders the %s profile viewer without unsupported field history',
  async resource => {
    query.mockResolvedValue({ available: true, entries: [], nextCursor: null })
    render(AdminResourceHistory, { resource, resourceId: 'id' })
    await waitFor(() =>
      expect(query).toHaveBeenCalledWith({ resource, id: 'id', before: undefined }),
    )
    expect(
      await screen.findByText(
        'No recorded changes yet. Earlier edits are not available.',
      ),
    ).toBeTruthy()
    expect(Boolean(screen.queryByText('Field definitions'))).toBe(resource !== 'layer')
    expect(screen.getByText(`Changes to this ${resource} · newest first`)).toBeTruthy()
  },
)

it('clearly identifies stored history while live recording is disabled', async () => {
  query.mockResolvedValue({
    available: true,
    recordingEnabled: false,
    entries: [],
    nextCursor: null,
  })
  render(AdminResourceHistory, { resource: 'hub', resourceId: 'id' })
  expect(
    await screen.findByText(
      'Showing stored history. New edits are not being recorded yet.',
    ),
  ).toBeTruthy()
})

it('links the actor profile separately from the changes disclosure', async () => {
  query.mockResolvedValue({
    available: true,
    nextCursor: null,
    entries: [
      {
        id: 'change',
        actorId: 'editor',
        origin: 'user',
        reason: null,
        actor: {
          name: 'History Editor',
          username: 'history.editor',
          displayUsername: 'History.Editor',
          image: null,
        },
        createdAt: '2026-11-05T10:00:00Z',
        initial: false,
        changes: [
          {
            path: ['code'],
            before: { present: true, value: 'old' },
            after: { present: true, value: 'new' },
          },
        ],
      },
    ],
  })
  render(AdminResourceHistory, { resource: 'hub', resourceId: 'id' })
  const link = await screen.findByRole('link', { name: '@History.Editor' })
  expect(link.getAttribute('href')).toBe('/admin/users/history.editor')
  expect(link.closest('button')).toBeNull()
  expect(screen.getByText('HE')).toBeTruthy()
  const disclosure = screen.getByRole('button', { name: '1 changed field' })
  await fireEvent.click(disclosure)
  expect(disclosure.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByRole('link', { name: '@History.Editor' })).toBe(link)
})

it('toggles the history surface without intercepting tree controls, profile links or selection', async () => {
  query.mockResolvedValue({
    available: true,
    nextCursor: null,
    entries: [
      {
        id: 'tree-change',
        actorId: 'editor',
        origin: 'user',
        reason: 'Options updated',
        actor: {
          name: 'History Editor',
          username: 'history.editor',
          displayUsername: 'History.Editor',
          image: null,
        },
        createdAt: '2026-11-05T10:00:00Z',
        previousCreatedAt: '2026-11-05T09:00:00Z',
        initial: false,
        fieldLabels: { contact: 'Preferred contact method' },
        changes: [
          {
            path: ['contact', 'values', 'option-id'],
            before: { present: false },
            after: {
              present: true,
              value: { record: { rank: 2 }, i18n: { en: { value: 'Telegram' } } },
            },
          },
        ],
      },
    ],
  })
  render(AdminResourceHistory, { resource: 'hub', resourceId: 'id' })
  await screen.findByText('New value')
  const disclosure = screen.getByRole('button', { name: '1 changed field' })
  await fireEvent.click(screen.getByText('Options updated'))
  expect(disclosure.getAttribute('aria-expanded')).toBe('false')
  await fireEvent.click(screen.getByText('Preferred contact method', { selector: 'h4' }))
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  await fireEvent.click(screen.getByRole('button', { name: 'Expand en' }))
  expect(screen.getByText('Telegram')).toBeTruthy()
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  const link = screen.getByRole('link', { name: '@History.Editor' })
  link.addEventListener('click', event => event.preventDefault(), { once: true })
  await fireEvent.click(link)
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  const selection = vi
    .spyOn(window, 'getSelection')
    .mockReturnValue({ isCollapsed: false } as Selection)
  await fireEvent.click(screen.getByText('Telegram'))
  expect(disclosure.getAttribute('aria-expanded')).toBe('true')
  selection.mockRestore()
  await fireEvent.click(screen.getByText('1 hour since previous version'))
  expect(disclosure.getAttribute('aria-expanded')).toBe('false')
})
