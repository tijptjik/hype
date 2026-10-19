// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UserDirectory from '#lib/bits/patterns/userDirectory/UserDirectory.svelte'

vi.mock('svelte/motion', () => ({ prefersReducedMotion: { current: true } }))
vi.mock('svelte/transition', () => ({ fade: () => ({ duration: 0 }) }))
vi.mock('svelte/animate', () => ({ flip: () => ({ duration: 0 }) }))
beforeEach(() => {
  vi.useRealTimers()
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
})
afterEach(cleanup)
const user = (id: string) => ({
  id,
  name: id,
  username: id,
  displayUsername: id,
  email: null,
  attribution: null,
  image: null,
})
const props = {
  users: [user('alpha'), user('beta')],
  totalCount: 2,
  hasMore: false,
  loading: false,
  hasLoaded: true,
  failed: false,
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
}

it('keeps settled row nodes while loading, then reconciles matching identities', async () => {
  const view = render(UserDirectory, props)
  const original = screen.getByText('@beta').closest('li')
  const list = screen.getByRole('list', { name: 'Users' })
  await view.rerender({ loading: true })
  expect(screen.getByText('@beta').closest('li')).toBe(original)
  expect(screen.queryByText('Loading users…')).toBeNull()
  await view.rerender({
    users: [user('beta'), user('gamma')],
    totalCount: 2,
    loading: false,
  })
  expect(screen.getByRole('list', { name: 'Users' })).toBe(list)
  expect(screen.getByText('@beta').closest('li')).toBe(original)
  expect(screen.queryByText('@alpha')).toBeNull()
  expect(screen.getByText('@gamma')).toBeTruthy()
})

it('retains settled empty results while a replacement loads and keeps rows on errors', async () => {
  const view = render(UserDirectory, { ...props, users: [], totalCount: 0 })
  const empty = screen.getByText('No users found. Try another name, username or email.')
  await view.rerender({ loading: true })
  expect(empty.isConnected).toBe(true)
  expect(screen.queryByText('Loading users…')).toBeNull()
  await view.rerender({ users: [user('beta')], totalCount: 1, loading: false })
  const original = screen.getByText('@beta').closest('li')
  await view.rerender({ failed: true })
  expect(screen.getByText('@beta').closest('li')).toBe(original)
  expect(screen.getByRole('alert')).toBeTruthy()
})

it('loads at the scroll sentinel and pauses observation while loading or failed', async () => {
  const disconnect = vi.fn()
  const observe = vi.fn()
  let intersect: IntersectionObserverCallback | undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback
      }
      observe = observe
      disconnect = disconnect
    },
  )
  const load = vi.fn()
  try {
    const view = render(UserDirectory, { ...props, hasMore: true, onLoadMore: load })
    expect(observe).toHaveBeenCalledTimes(1)
    if (!intersect) throw new Error('Observer was not created')
    intersect(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(load).toHaveBeenCalledTimes(1)
    await view.rerender({ loading: true })
    expect(disconnect).toHaveBeenCalledTimes(1)
    await view.rerender({ loading: false, failed: true })
    expect(observe).toHaveBeenCalledTimes(1)
    await view.rerender({ failed: false })
    expect(observe).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull()
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
})
