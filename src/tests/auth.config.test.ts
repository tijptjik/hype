import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { authConfig } from '$lib/auth/config'
import { user } from '$lib/db/schema/user'

describe('authConfig user.additionalFields', () => {
  it('only persists fields that exist on the user table', () => {
    const userColumnNames = new Set(Object.keys(getTableColumns(user)))
    const additionalFieldNames = Object.keys(authConfig.user.additionalFields)

    expect(
      additionalFieldNames.every(fieldName => userColumnNames.has(fieldName)),
    ).toBe(true)
  })
})
