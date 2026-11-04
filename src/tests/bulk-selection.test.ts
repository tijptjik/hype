// TESTS
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import { collectBulkSelection } from '#lib/client/services/bulkSelection.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'

describe('complete bulk selection', () => {
  it('includes unloaded pages, deduplicates IDs and applies filters to every page', async () => {
    const rows = Array.from({ length: 128 }, (_, id) => ({
      id: String(id),
      matches: id % 2 === 0,
    }))
    const readPage = vi.fn(async (offset: number) => ({
      data: rows.slice(offset, offset + 50),
      hasMore: offset + 50 < rows.length,
      nextOffset: offset + 50,
    }))
    const ids = await collectBulkSelection(
      readPage,
      page => page.filter(row => row.matches),
      () => true,
    )
    expect(ids).toEqual(rows.filter(row => row.matches).map(row => row.id))
    expect(readPage.mock.calls.map(([offset]) => offset)).toEqual([0, 50, 100])
  })

  it('never returns a partial selection when a later page fails', async () => {
    await expect(
      collectBulkSelection(
        async offset => {
          if (offset) throw new Error('offline')
          return { data: [{ id: 'first' }], hasMore: true, nextOffset: 1 }
        },
        rows => rows,
        () => true,
      ),
    ).rejects.toThrow('offline')
  })

  it('discards a response after scope changes or cancellation', async () => {
    let current = true
    const result = await collectBulkSelection(
      async () => {
        current = false
        return { data: [{ id: 'old-scope' }], hasMore: false }
      },
      rows => rows,
      () => current,
    )
    expect(result).toBeNull()
  })

  it('deduplicates overlapping pages and rejects a non-advancing cursor', async () => {
    expect(
      await collectBulkSelection(
        async offset => ({
          data: offset ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }],
          hasMore: !offset,
          nextOffset: 1,
        }),
        rows => rows,
        () => true,
      ),
    ).toEqual(['a', 'b'])
    await expect(
      collectBulkSelection(
        async () => ({
          data: [],
          hasMore: true,
          nextOffset: 0,
        }),
        rows => rows,
        () => true,
      ),
    ).rejects.toThrow('did not advance')
  })
})

it.each([false, true])(
  'uses refreshed native pages for complete selection (denied: %s)',
  async denied => {
    const retained = Object.assign(
      Promise.resolve({ data: [{ id: 'obsolete' }], hasMore: false }),
      {
        current: { data: [{ id: 'obsolete' }], hasMore: false },
        refresh: vi.fn(async () => {
          if (denied) throw new Error('access revoked')
          retained.current = { data: [{ id: 'current' }], hasMore: false }
        }),
      },
    )
    const pending = collectBulkSelection(
      () => refreshRemoteQuery(retained),
      rows => rows,
      () => true,
    )
    if (denied) await expect(pending).rejects.toThrow('access revoked')
    else expect(await pending).toEqual(['current'])
    expect(retained.refresh).toHaveBeenCalledOnce()
  },
)
