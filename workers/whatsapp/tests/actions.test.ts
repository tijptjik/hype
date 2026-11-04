import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
it('acknowledges incoming reads, syncs own-client reads and protects sender deletion', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-actions'),
    async instance => {
      const chat = '15555550100@s.whatsapp.net',
        sender = chat
      await instance.journal.receive(
        JSON.stringify([
          {
            chat,
            sender,
            id: 'incoming',
            timestamp: Date.now(),
            fromMe: false,
            text: 'hi',
            payload: JSON.stringify({ message: { conversation: 'hi' } }),
          },
          {
            chat,
            sender: 'self',
            id: 'outgoing',
            timestamp: Date.now(),
            fromMe: true,
            text: 'hi',
            payload: JSON.stringify({ message: { conversation: 'hi' } }),
          },
        ]),
      )
      const readMessage = vi.fn().mockResolvedValue(undefined),
        deleteMessage = vi.fn().mockResolvedValue(undefined)
      const status = vi.spyOn(instance, 'status').mockReturnValue({
        connected: true,
        loggedOut: false,
        qr: null,
        qrExpiresAt: null,
      })
      Object.assign(instance, { session: { readMessage, deleteMessage } })
      try {
        await instance.messageAction(
          chat,
          { id: 'incoming', sender },
          'read',
          'read-one',
        )
        expect(
          instance.journal.inbox(0, 100).find(m => m.id === 'incoming')?.readByMe,
        ).toBe(true)
        await expect(
          instance.messageAction(chat, { id: 'incoming', sender }, 'delete', 'bad'),
        ).rejects.toThrow('Invalid action')
        await instance.messageAction(
          chat,
          { id: 'outgoing', sender: 'self' },
          'delete',
          'delete-one',
        )
        await instance.messageAction(
          chat,
          { id: 'outgoing', sender: 'self' },
          'delete',
          'delete-one',
        )
        expect(deleteMessage).toHaveBeenCalledTimes(1)
        expect(
          instance.journal.inbox(0, 100).find(m => m.id === 'outgoing')?.deleted,
        ).toBe(true)
        instance.journal.receipt(
          JSON.stringify({ chats: [chat], ids: ['later'], state: 'readByMe' }),
        )
        await instance.journal.receive(
          JSON.stringify([
            {
              chat,
              sender,
              id: 'later',
              timestamp: 1,
              fromMe: false,
              text: 'old',
              payload: JSON.stringify({ message: { conversation: 'old' } }),
            },
          ]),
        )
        expect(
          instance.journal.inbox(0, 100).find(m => m.id === 'later')?.readByMe,
        ).toBe(true)
      } finally {
        Object.assign(instance, { session: undefined })
        status.mockRestore()
      }
    },
  )
})
