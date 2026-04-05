import { describe, expect, it } from 'vitest'
import { isSqliteMissingSchemaError } from '$lib/db/services/sqlite'

describe('isSqliteMissingSchemaError', () => {
  it('matches missing table errors for the requested table', () => {
    const error = new Error('D1_ERROR: no such table: userFeature')

    expect(isSqliteMissingSchemaError(error, 'userFeature')).toBe(true)
    expect(isSqliteMissingSchemaError(error, 'userLayer')).toBe(false)
  })

  it('matches missing column errors in nested causes', () => {
    const rootCause = new Error('SQLite error: no such column: userFeature.userId')
    const error = new Error('Failed query')
    error.cause = rootCause

    expect(isSqliteMissingSchemaError(error, 'userFeature')).toBe(true)
  })

  it('ignores unrelated database errors', () => {
    const error = new Error('SQLITE_BUSY: database is locked')

    expect(isSqliteMissingSchemaError(error, 'userFeature')).toBe(false)
  })
})
