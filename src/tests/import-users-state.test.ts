// TESTING
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/api/server/user.remote', () => ({
  getUser: vi.fn(),
  searchUsers: vi.fn(),
}))

// API
import { searchUsers } from '$lib/api/server/user.remote'
// SERVICES
import {
  validateUsers,
  enrichFeaturesWithUserData,
  updateUserSearchResults,
  updateResolutionUserSearchResults,
  setUserResolution,
  removeUserResolution,
} from '$lib/client/services/import/users'
// TYPES
import type { ImportCtx } from '$lib/context/import.svelte'
import type {
  FeatureCSVColumn,
  UserValidationResult,
} from '$lib/client/services/import/types'

function createContext() {
  let query = ''
  let results: UserValidationResult[] = []
  let queries = new Map<string, string>()
  let resolutionResults = new Map<string, UserValidationResult[]>()
  let enriched: Record<string, unknown> = {
    user: { id: 'old-user' },
    title: 'Preserved',
  }
  let columns: FeatureCSVColumn[] = []
  let fallbackUserId: string | undefined
  const context = {
    setUserSearchQuery: (value: string) => {
      query = value
    },
    getUserSearchQuery: () => query,
    setUserSearchResults: (value: UserValidationResult[]) => {
      results = value
    },
    getUserSearchResults: () => results,
    getResolutionSearchQueries: () => queries,
    setResolutionSearchQueries: (value: Map<string, string>) => {
      queries = value
    },
    getResolutionSearchResults: () => resolutionResults,
    setResolutionSearchResults: (value: Map<string, UserValidationResult[]>) => {
      resolutionResults = value
    },
    getData: () => [['unmatched']],
    getColumns: () => columns,
    getHeaders: () => ['user'],
    getUserValidation: () => ({ fallbackUserId }),
    getUserResolution: () => ({ resolutions: new Map() }),
    getRowEnrichedData: () => enriched,
    setRowEnrichedData: (_index: number, value: Record<string, unknown>) => {
      enriched = value
    },
  }
  return {
    context: context as unknown as ImportCtx,
    read: context,
    setColumns: (value: FeatureCSVColumn[]) => {
      columns = value
    },
    setFallback: (value?: string) => {
      fallbackUserId = value
    },
  }
}

beforeEach(() => vi.resetAllMocks())

describe('contributor import state', () => {
  it('completes empty user-column validation', async () => {
    const onResults = vi.fn()
    await expect(
      validateUsers([], [['anything']], ['column'], vi.fn(), onResults),
    ).resolves.toEqual({ invalidCount: 0, results: [] })
    expect(onResults).toHaveBeenCalledWith([])
  })

  it.each([false, true])(
    'clears stale contributors after resolution/fallback removal (mapped: %s)',
    mapped => {
      const { context, read, setColumns } = createContext()
      if (mapped)
        setColumns([
          { header: 'user', sampleValues: [], modelType: 'User', field: 'id' },
        ])
      enrichFeaturesWithUserData(context, [])
      expect(read.getRowEnrichedData()).toEqual({ title: 'Preserved' })
    },
  )

  it('replaces a stale contributor with the current fallback', () => {
    const { context, read, setColumns, setFallback } = createContext()
    setColumns([{ header: 'user', sampleValues: [], modelType: 'User', field: 'id' }])
    setFallback('new-fallback')
    enrichFeaturesWithUserData(context, [])
    expect(read.getRowEnrichedData()).toEqual({
      user: { id: 'new-fallback' },
      title: 'Preserved',
    })
  })

  it.each(['new', 'old'])(
    'does not let a slow fallback search overwrite a newer %s query',
    async query => {
      const { context, read } = createContext()
      const old = Promise.withResolvers<Awaited<ReturnType<typeof searchUsers>>>()
      vi.mocked(searchUsers).mockReturnValueOnce(
        old.promise as unknown as ReturnType<typeof searchUsers>,
      )
      vi.mocked(searchUsers).mockResolvedValueOnce({
        data: [{ id: 'new-user' }],
      } as unknown as Awaited<ReturnType<typeof searchUsers>>)
      const pending = updateUserSearchResults(context, 'old')
      await updateUserSearchResults(context, query)
      old.resolve({ data: [{ id: 'old-user' }] } as unknown as Awaited<
        ReturnType<typeof searchUsers>
      >)
      await pending
      expect(read.getUserSearchResults()[0].userId).toBe('new-user')
    },
  )

  it('keeps validated contributors ahead of fallback and preserves earlier row snapshots', () => {
    const { context, read, setColumns, setFallback } = createContext()
    setColumns([{ header: 'user', sampleValues: [], modelType: 'User', field: 'id' }])
    setFallback('fallback')
    const previous = read.getRowEnrichedData()
    enrichFeaturesWithUserData(context, [
      { value: 'unmatched', isValid: true, userId: 'validated' },
    ])
    expect(read.getRowEnrichedData()).toEqual({
      user: { id: 'validated' },
      title: 'Preserved',
    })
    expect(previous).toEqual({ user: { id: 'old-user' }, title: 'Preserved' })
  })

  it('preserves other rows added while a resolution search is pending', async () => {
    const { context, read } = createContext()
    const pendingSearch =
      Promise.withResolvers<Awaited<ReturnType<typeof searchUsers>>>()
    vi.mocked(searchUsers).mockReturnValueOnce(
      pendingSearch.promise as unknown as ReturnType<typeof searchUsers>,
    )
    vi.mocked(searchUsers).mockResolvedValue({
      data: [{ id: 'user' }],
    } as unknown as Awaited<ReturnType<typeof searchUsers>>)
    const pending = updateResolutionUserSearchResults(context, 'row-a', 'alpha')
    await updateResolutionUserSearchResults(context, 'row-b', 'bravo')
    await updateResolutionUserSearchResults(context, 'row-c', 'charlie')
    pendingSearch.resolve({ data: [{ id: 'user-a' }] } as unknown as Awaited<
      ReturnType<typeof searchUsers>
    >)
    await pending
    expect([...read.getResolutionSearchResults().keys()].sort()).toEqual([
      'row-a',
      'row-b',
      'row-c',
    ])
  })

  it('does not restore results after a resolution query is cleared', async () => {
    const { context, read } = createContext()
    const deferred = Promise.withResolvers<Awaited<ReturnType<typeof searchUsers>>>()
    vi.mocked(searchUsers).mockReturnValueOnce(
      deferred.promise as unknown as ReturnType<typeof searchUsers>,
    )
    const pending = updateResolutionUserSearchResults(context, 'row', 'query')
    await updateResolutionUserSearchResults(context, 'row', '')
    deferred.resolve({ data: [{ id: 'stale' }] } as unknown as Awaited<
      ReturnType<typeof searchUsers>
    >)
    await pending
    expect(read.getResolutionSearchResults().has('row')).toBe(false)
  })

  it('adds and removes resolutions without mutating earlier state snapshots', () => {
    const original = new Map([['first', { userId: 'user-1' }]])
    const added = setUserResolution('second', 'user-2', undefined, original)
    expect([...original.keys()]).toEqual(['first'])
    expect([...added.keys()]).toEqual(['first', 'second'])
    const removed = removeUserResolution('first', added)
    expect([...added.keys()]).toEqual(['first', 'second'])
    expect([...removed.keys()]).toEqual(['second'])
  })
})
