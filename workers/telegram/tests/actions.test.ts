import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

it('syncs incoming reads and revokes own messages without repeating deletion', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-actions'),
    async instance => {
      instance.journal.record({
        id: '7',
        chat: '42',
        sender: '42',
        timestamp: 1,
        fromMe: false,
        text: 'incoming',
      })
      instance.journal.record({
        id: '8',
        chat: '42',
        sender: '99',
        timestamp: 2,
        fromMe: true,
        text: 'outgoing',
      })
      const readHistory = vi.fn().mockResolvedValue(undefined),
        deleteMessagesById = vi.fn().mockResolvedValue(undefined)
      Object.assign(instance, {
        state: { connected: true },
        client: { readHistory, deleteMessagesById },
      })
      await instance.messageAction('42', { id: '7', sender: '42' }, 'read', 'read-one')
      expect(readHistory).toHaveBeenCalledExactlyOnceWith(42, { maxId: 7 })
      expect(instance.journal.message('42', '7')?.readByMe).toBe(true)
      await expect(
        instance.messageAction('42', { id: '7', sender: '42' }, 'delete', 'bad'),
      ).rejects.toThrow('Invalid action')
      await instance.messageAction(
        '42',
        { id: '8', sender: '99' },
        'delete',
        'delete-one',
      )
      await instance.messageAction(
        '42',
        { id: '8', sender: '99' },
        'delete',
        'delete-one',
      )
      expect(deleteMessagesById).toHaveBeenCalledExactlyOnceWith(42, [8], {
        revoke: true,
      })
      expect(instance.journal.message('42', '8')?.deleted).toBe(true)
    },
  )
})

it('retains uncertain deletion rather than issuing a second revoke', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('uncertain-delete'),
    async instance => {
      instance.journal.record({
        id: '8',
        chat: '42',
        sender: '99',
        timestamp: 2,
        fromMe: true,
        text: 'outgoing',
      })
      const deleteMessagesById = vi
        .fn()
        .mockRejectedValue(new Error('synthetic disconnect'))
      Object.assign(instance, {
        state: { connected: true },
        client: { deleteMessagesById },
      })
      await expect(
        instance.messageAction('42', { id: '8', sender: '99' }, 'delete', 'same'),
      ).rejects.toThrow('disconnect')
      await expect(
        instance.messageAction('42', { id: '8', sender: '99' }, 'delete', 'same'),
      ).rejects.toThrow('uncertain')
      expect(deleteMessagesById).toHaveBeenCalledTimes(1)
    },
  )
})
