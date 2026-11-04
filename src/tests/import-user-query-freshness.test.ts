// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// API
import { getUser, searchUsers as searchUsersRemote } from '#lib/api/user.remote.js'
// SERVICES
import {
  validateUserById,
  validateUserByUsername,
  searchUsers,
} from '#lib/client/services/import/users.js'

vi.mock('#lib/api/user.remote.js', () => ({ getUser: vi.fn(), searchUsers: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
})

it.each(['id', 'username'])(
  'refreshes retained %s validation before accepting a contributor',
  async kind => {
    const query = Object.assign(Promise.resolve({ data: { id: 'removed' } }), {
      current: { data: { id: 'removed' } } as { data: { id: string } | null },
      refresh: vi.fn(async () => {
        query.current = { data: null }
      }),
    })
    vi.mocked(getUser).mockReturnValue(query as never)
    if (kind === 'id') expect(await validateUserById('removed')).toBe(false)
    else
      expect(await validateUserByUsername('removed')).toEqual({
        isValid: false,
        userId: undefined,
      })
    expect(query.refresh).toHaveBeenCalledOnce()
  },
)

it('refreshes retained search results before exposing selectable contributors', async () => {
  const query = Object.assign(Promise.resolve({ data: [{ id: 'removed' }] }), {
    current: { data: [{ id: 'removed' }] },
    refresh: vi.fn(async () => {
      query.current = { data: [] }
    }),
  })
  vi.mocked(searchUsersRemote).mockReturnValue(query as never)
  expect(await searchUsers('name')).toEqual([])
  expect(query.refresh).toHaveBeenCalledOnce()
})

it('does not fall back to retained user data when refreshing fails', async () => {
  const query = Object.assign(Promise.resolve({ data: { id: 'old' } }), {
    current: { data: { id: 'old' } },
    refresh: vi.fn().mockRejectedValue(new Error('access denied')),
  })
  vi.mocked(getUser).mockReturnValue(query as never)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(await validateUserById('old')).toBe(false)
  } finally {
    log.mockRestore()
  }
})
