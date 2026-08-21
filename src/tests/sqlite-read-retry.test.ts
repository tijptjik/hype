import { describe, expect, it } from 'vitest'
import { isSqliteBusyError } from '$lib/db/services/sqlite'

describe('D1 read retry detection', () => {
  it('recognises a busy SQLite error nested in a D1 object wrapper', () => {
    expect(
      isSqliteBusyError({
        error: {
          cause: { message: 'SQLITE_BUSY: database is locked' },
        },
      }),
    ).toBe(true)
  })

  it('does not retry unrelated D1 failures', () => {
    expect(
      isSqliteBusyError({
        message: 'D1_ERROR: no such table: hub',
      }),
    ).toBe(false)
  })
})
