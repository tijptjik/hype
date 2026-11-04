import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import type { Mutation } from '../src/database'

const pn = '15555550100@s.whatsapp.net',
  lid = '70000000001@lid'
function mapping(): Mutation[] {
  return [
    {
      kind: 'put',
      key: ['lid', '70000000001', '', ''],
      value: new TextEncoder().encode(
        JSON.stringify({ lid: '70000000001', phone_number: '15555550100' }),
      ),
      timestamp: 1,
    },
    {
      kind: 'put',
      key: ['pn', '15555550100', '', ''],
      value: new TextEncoder().encode(JSON.stringify('70000000001')),
      timestamp: 1,
    },
  ]
}

it('uses the native session archive API, keeps confirmed state on failure and restores aliases together', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-native-archive'),
    async instance => {
      instance.database.batch(mapping())
      const archiveChat = vi.fn().mockResolvedValue(undefined)
      const status = vi.spyOn(instance, 'status').mockReturnValue({
        connected: true,
        loggedOut: false,
        qr: null,
        qrExpiresAt: null,
      })
      Object.assign(instance, { session: { archiveChat } })
      try {
        const archived = await instance.archive(pn, true)
        expect(archiveChat).toHaveBeenCalledExactlyOnceWith(pn, true)
        expect(archived).toMatchObject({ chat: pn, isArchived: true })
        expect(instance.journal.conversations.get(lid)?.isArchived).toBe(true)
        archiveChat.mockRejectedValueOnce(new Error('synthetic disconnect'))
        await expect(instance.archive(pn, false)).rejects.toThrow('disconnect')
        expect(instance.journal.conversations.get(pn)).toEqual(archived)
        expect((await instance.archive(pn, false)).isArchived).toBe(false)
        expect(archiveChat).toHaveBeenLastCalledWith(pn, false)
        expect(instance.journal.conversations.get(lid)?.isArchived).toBe(false)
      } finally {
        Object.assign(instance, { session: undefined })
        status.mockRestore()
      }
    },
  )
})

it.each([true, false])(
  'persists native Rust archive events with mapping first=%s, across eviction and account isolation',
  async mappingFirst => {
    const name = `synthetic-native-alias-${mappingFirst}`,
      stub = env.ACCOUNTS.getByName(name)
    await runInDurableObject(stub, async instance => {
      if (mappingFirst) instance.database.batch(mapping())
      expect(instance.engine.qualifyArchiveEvent(instance.journal, lid, true)).toBe(
        false,
      )
      if (!mappingFirst) instance.database.batch(mapping())
      expect(instance.journal.conversations.get(pn)?.isArchived).toBe(true)
      const cursor = instance.journal.conversations.updates(0).at(-1)!.sequence
      instance.engine.qualifyArchiveEvent(instance.journal, lid, false)
      expect(instance.snapshot(0, cursor).conversations).toHaveLength(2)
      expect(instance.journal.conversations.get(pn)?.isArchived).toBe(false)
      // An unverified LID never borrows another user's phone mapping.
      instance.engine.qualifyArchiveEvent(instance.journal, '70000000002@lid', true)
      expect(instance.journal.conversations.get(pn)?.isArchived).toBe(false)
      expect(
        instance.engine.qualifyArchiveEvent(
          {
            archiveUpdate() {
              throw new Error('synthetic storage failure')
            },
          },
          lid,
          true,
        ),
      ).toBe(true)
    })
    await evictDurableObject(stub)
    const saved = await exports.default.snapshot(name, 0, 0)
    expect(saved.conversations).toContainEqual(
      expect.objectContaining({ chat: pn, isArchived: false }),
    )
    expect(
      (await exports.default.snapshot('synthetic-other-archive', 0, 0)).conversations,
    ).toEqual([])
  },
)

it('replays folder state independently in bounded pages and retries failed native bootstrap', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-archive-replay'),
    async instance => {
      for (let index = 1; index <= 105; index++)
        instance.journal.conversations.record(
          `${15555550000 + index}@s.whatsapp.net`,
          true,
        )
      const first = instance.snapshot(0, 0).conversations
      expect(first).toHaveLength(100)
      expect(instance.snapshot(0, first.at(-1)!.sequence).conversations).toHaveLength(5)
      expect(() => instance.snapshot(0, -1)).toThrow('cursor')
      const syncArchiveState = vi
        .fn()
        .mockRejectedValueOnce(new Error('synthetic offline'))
        .mockResolvedValue(undefined)
      const session = {
        syncArchiveState,
        archiveNeedsSync: () => false,
        callSnapshot: () => JSON.stringify({ incoming: [], current: null }),
      }
      Object.assign(instance, { session })
      const status = vi.spyOn(instance, 'status').mockReturnValue({
        connected: true,
        loggedOut: false,
        qr: null,
        qrExpiresAt: null,
      })
      const access = instance as unknown as {
        archiveSync?: Promise<void>
        archiveSyncRetry: number
      }
      try {
        instance.snapshot()
        await access.archiveSync
        expect(syncArchiveState).toHaveBeenCalledTimes(1)
        access.archiveSyncRetry = 0
        instance.snapshot()
        await access.archiveSync
        expect(syncArchiveState).toHaveBeenCalledTimes(2)
        access.archiveSyncRetry = 0
        instance.snapshot()
        await access.archiveSync
        expect(syncArchiveState).toHaveBeenCalledTimes(2)
      } finally {
        Object.assign(instance, { session: undefined })
        status.mockRestore()
      }
    },
  )
})
