import { SQL } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { cleanupExpiredAnonymousUsers } from '$lib/auth/anonymous.server'
import type { Database } from '$lib/types'

const containsDirectDateChunk = (value: unknown): boolean => {
  if (!(value instanceof SQL)) return false

  return value.queryChunks.some(
    chunk => chunk instanceof Date || containsDirectDateChunk(chunk),
  )
}

describe('anonymous user cleanup', () => {
  it('binds the active-session cutoff as a timestamp primitive', async () => {
    let condition: unknown
    const now = new Date('2026-08-02T00:00:00.000Z')
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn((whereCondition: unknown) => {
          condition = whereCondition
          return {
            returning: vi.fn(async () => []),
          }
        }),
      })),
    } as unknown as Database

    await cleanupExpiredAnonymousUsers(db, now)

    expect(condition).toBeInstanceOf(SQL)
    expect(containsDirectDateChunk(condition)).toBe(false)
  })
})
