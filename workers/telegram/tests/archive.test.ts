import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import type { TelegramClient } from '@mtcute/core/client.js'

it('uses native archive and restore, preserving confirmation on provider failure', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-archive-rpc'),
    async instance => {
      const archiveChats = vi.fn().mockResolvedValue(undefined),
        unarchiveChats = vi.fn().mockResolvedValue(undefined)
      Object.assign(instance, {
        state: { connected: true },
        client: { archiveChats, unarchiveChats },
      })
      const archived = await instance.archive('42', true)
      expect(archiveChats).toHaveBeenCalledExactlyOnceWith(42)
      expect(archived).toMatchObject({ chat: '42', isArchived: true })
      archiveChats.mockRejectedValueOnce(new Error('synthetic disconnect'))
      await expect(instance.archive('42', true)).rejects.toThrow('disconnect')
      expect(instance.conversations.get('42')).toEqual(archived)
      const restored = await instance.archive('42', false)
      expect(unarchiveChats).toHaveBeenCalledExactlyOnceWith(42)
      expect(restored.isArchived).toBe(false)
      expect(restored.sequence).toBeGreaterThan(archived.sequence)
      await expect(instance.archive('not-a-peer', true)).rejects.toThrow()
    },
  )
})

it('persists native folder updates through the registered SDK listener and replays them after eviction', async () => {
  const stub = env.ACCOUNTS.getByName('synthetic-native-folders')
  await runInDurableObject(stub, async instance => {
    const access = instance as unknown as { engine(): Promise<TelegramClient> }
    const client = await access.engine()
    try {
      client.onRawUpdate.emit({
        update: {
          _: 'updateFolderPeers',
          folderPeers: [
            { _: 'folderPeer', peer: { _: 'peerUser', userId: 42 }, folderId: 1 },
          ],
        },
      } as never)
      expect(instance.conversations.get('42')?.isArchived).toBe(true)
      const cursor = instance.conversations.get('42')!.sequence
      client.onRawUpdate.emit({
        update: {
          _: 'updateFolderPeers',
          folderPeers: [
            { _: 'folderPeer', peer: { _: 'peerUser', userId: 42 }, folderId: 0 },
          ],
        },
      } as never)
      expect(instance.snapshot(0, cursor).conversations).toEqual([
        expect.objectContaining({ chat: '42', isArchived: false }),
      ])
    } finally {
      await instance.stop()
    }
  })
  await evictDurableObject(stub)
  expect(
    (await exports.default.snapshot('synthetic-native-folders', 0, 0)).conversations,
  ).toEqual([expect.objectContaining({ chat: '42', isArchived: false })])
  expect(
    (await exports.default.snapshot('synthetic-other-archive', 0, 0)).conversations,
  ).toEqual([])
})

it('discovers archived dialogs beyond the 30-thread message import without overwriting a newer native change', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-folder-import'),
    async instance => {
      const listeners = new Set<(event: any) => void>()
      const client = {
        onRawUpdate: {
          add: (fn: any) => listeners.add(fn),
          remove: (fn: any) => listeners.delete(fn),
        },
        iterDialogs: vi.fn(async function* () {
          for (let id = 1; id <= 105; id++) {
            if (id === 35) {
              const event = {
                update: {
                  _: 'updateFolderPeers',
                  folderPeers: [{ peer: { _: 'peerUser', userId: id }, folderId: 0 }],
                },
              }
              instance.conversations.record(String(id), false)
              listeners.forEach(listener => {
                listener(event)
              })
            }
            yield {
              peer: { id },
              isArchived: true,
              lastMessage: null,
              lastReadOutgoing: 0,
              lastReadIngoing: 0,
            }
          }
        }),
        getHistory: vi.fn().mockResolvedValue([]),
      }
      Object.assign(instance, { client })
      await (
        instance as unknown as { importRecentHistory(client: unknown): Promise<void> }
      ).importRecentHistory(client)
      expect(client.iterDialogs).toHaveBeenCalledWith({
        archived: 'keep',
        chunkSize: 100,
      })
      expect(client.getHistory).toHaveBeenCalledTimes(30)
      expect(instance.conversations.get('35')?.isArchived).toBe(false)
      expect(listeners.size).toBe(0)
      const first = instance.snapshot(0, 0).conversations!
      expect(first).toHaveLength(100)
      expect(instance.snapshot(0, first.at(-1)!.sequence).conversations).toHaveLength(5)
      const before = instance.conversations.get('105')
      expect(instance.conversations.record('105', true)).toEqual(before)
      expect(() => instance.snapshot(0, -1)).toThrow('cursor')
    },
  )
})
