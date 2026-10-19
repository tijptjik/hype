// @vitest-environment node
// TESTING
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
import type { z } from 'zod'

const mocks = vi.hoisted(() => ({
  context: {
    db: {} as unknown,
    user: null as { id: string; isAnonymous?: boolean; superAdmin?: boolean } | null,
  },
  read: vi.fn(),
  write: vi.fn(),
}))
vi.mock('#lib/api/services/themePreferences.js', () => ({
  readThemePreferences: mocks.read,
  writeThemePreferences: mocks.write,
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: z.ZodType,
    handler: (input: unknown, context: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), mocks.context),
      'query',
    ),
  guardedCommand: (
    schema: z.ZodType,
    handler: (input: unknown, context: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), mocks.context),
      'command',
    ),
}))
import {
  getThemePreferences,
  saveThemePreferences,
} from '#lib/api/themePreferences.remote.js'

const preferences = {
  uiTheme: 'hype-light',
  mapStyle: 'hyperLight',
  syncUiAndMap: true,
  useActiveMapStyle: false,
} as const
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.user = { id: 'account' }
  mocks.read.mockResolvedValue(preferences)
})

describe('appearance preference account boundary', () => {
  it('reads and writes only the expected session account', async () => {
    expect(await getThemePreferences({ accountId: 'account' })).toEqual(preferences)
    expect(await saveThemePreferences({ accountId: 'account', preferences })).toEqual(
      preferences,
    )
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(mocks.context.db, 'account')
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(
      mocks.context.db,
      'account',
      preferences,
    )
  })
  it('allows an anonymous account to retain its own appearance', async () => {
    mocks.context.user = { id: 'account', isAnonymous: true }
    await saveThemePreferences({ accountId: 'account', preferences })
    expect(mocks.write).toHaveBeenCalledOnce()
  })
  it('rejects a late write targeting a previous login, even for super-admins', async () => {
    mocks.context.user = { id: 'other', superAdmin: true }
    await expect(
      saveThemePreferences({ accountId: 'account', preferences }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(getThemePreferences({ accountId: 'account' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('requires authentication to save and rejects invalid catalog values', async () => {
    mocks.context.user = null
    expect(await getThemePreferences({ accountId: 'account' })).toBeNull()
    await expect(
      saveThemePreferences({ accountId: 'account', preferences }),
    ).rejects.toMatchObject({ status: 401 })
    mocks.context.user = { id: 'account' }
    await expect(
      saveThemePreferences({
        accountId: 'account',
        preferences: { ...preferences, uiTheme: 'invalid' } as never,
      }),
    ).rejects.toThrow()
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
