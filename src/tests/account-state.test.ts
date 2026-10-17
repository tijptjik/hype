// TESTING
import { describe, expect, it } from 'vitest'
// CONTEXT
import { AccountState } from '#lib/context/account.svelte.js'
// TYPES
import type { SessionUser } from '#lib/types.js'
import type { CurrentUser } from '#lib/db/zod/schema/user.types.js'

/** Builds the identity fields relevant to account transitions. @param patch Session overrides. @returns A test session. */
function session(patch: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'alice',
    username: 'alice',
    name: 'Alice',
    isAnonymous: false,
    superAdmin: false,
    roles: [],
    preferences: { fallbackLocales: [] },
    ...patch,
  } as SessionUser
}

describe('root account state', () => {
  it('enriches presentation without changing authoritative identity or authorization', () => {
    const identity = session()
    const account = new AccountState(identity)
    account.applyProfile({
      id: 'alice',
      name: 'Updated Alice',
      isAnonymous: true,
      superAdmin: true,
      roles: [{ type: 'organisation', organisationId: 'secret', role: 'admin' }],
      userLayers: [{ layerId: 'saved' }],
    } as CurrentUser)
    expect(account.user).toMatchObject({
      id: 'alice',
      name: 'Updated Alice',
      isAnonymous: false,
      superAdmin: false,
      roles: [],
      userLayers: [{ layerId: 'saved' }],
    })
    expect(account.session).toBe(identity)
    expect(account.session?.name).toBe('Alice')
    expect(account.applyProfile({ id: 'bob', name: 'Bob' })).toBe(false)
    expect(account.user?.id).toBe('alice')
  })

  it('preserves saved presentation through same-scope session refreshes', () => {
    const account = new AccountState(session())
    const revision = account.revision
    account.applyProfile({
      username: 'new-name',
      preferences: { allowMachineTranslation: true },
    })
    account.syncSession(session())
    expect(account.revision).toBe(revision)
    expect(account.user?.username).toBe('new-name')
    expect(account.user?.preferences?.allowMachineTranslation).toBe(true)
  })

  it.each([
    { id: 'bob' },
    { isAnonymous: true },
    { superAdmin: true },
    { roles: [{ type: 'organisation', organisationId: 'org', role: 'admin' }] },
  ] as Partial<SessionUser>[])(
    'clears enrichment and rejects pending writes on scope change %j',
    patch => {
      const account = new AccountState(session())
      const revision = account.revision
      account.applyProfile({
        attribution: 'Old attribution',
        userLayers: [{ layerId: 'saved' }],
      } as Partial<CurrentUser>)
      account.syncSession(session(patch))
      expect(account.revision).toBeGreaterThan(revision)
      expect(account.user?.userLayers).toEqual([])
      expect(account.applyProfile({ attribution: 'Late response' }, revision)).toBe(
        false,
      )
      expect(account.user?.attribution).not.toBe('Late response')
    },
  )

  it('rejects old responses even after signing back into the same account', () => {
    const account = new AccountState(session())
    const revision = account.revision
    account.syncSession(null)
    expect(account.user).toBeNull()
    expect(account.applyProfile({ name: 'No session' })).toBe(false)
    account.syncSession(session())
    expect(account.applyProfile({ name: 'Old request' }, revision)).toBe(false)
    expect(account.user?.name).toBe('Alice')
  })
})
