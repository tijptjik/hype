import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

it('edits the original journal entry and never repeats an immutable edit', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('synthetic-edit'), async instance => {
    const chat = '15555550100@s.whatsapp.net',
      sender = '15555550101@s.whatsapp.net'
    await instance.journal.receive(
      JSON.stringify([
        {
          chat,
          sender,
          id: 'original',
          timestamp: Date.now(),
          fromMe: true,
          text: 'before',
          payload: JSON.stringify({ message: { conversation: 'before' } }),
        },
      ]),
    )
    const editText = vi.fn().mockResolvedValue(undefined)
    const status = vi.spyOn(instance, 'status').mockReturnValue({
      connected: true,
      loggedOut: false,
      qr: null,
      qrExpiresAt: null,
    })
    Object.assign(instance, { session: { editText } })
    try {
      const request = {
        requestId: 'edit-1',
        to: chat,
        text: 'after',
        editTo: { id: 'original', sender },
      }
      expect(await instance.send(request)).toMatchObject({
        state: 'submitted',
        messageId: 'original',
      })
      await instance.send(request)
      expect(editText).toHaveBeenCalledExactlyOnceWith(
        chat,
        'original',
        sender,
        'after',
      )
      const messages = instance.journal.inbox(1, 100)
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        id: 'original',
        text: 'after',
        content: { text: 'after' },
      })
      expect(messages[0].editedAt).toBeGreaterThan(0)
      await expect(instance.send({ ...request, text: 'different' })).rejects.toThrow(
        'requestId',
      )
    } finally {
      Object.assign(instance, { session: undefined })
      status.mockRestore()
    }
  })
})

it('refuses incoming and expired messages before contacting WhatsApp', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-edit-rejected'),
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
            text: 'before',
            payload: JSON.stringify({ message: { conversation: 'before' } }),
          },
        ]),
      )
      const editText = vi.fn()
      const status = vi.spyOn(instance, 'status').mockReturnValue({
        connected: true,
        loggedOut: false,
        qr: null,
        qrExpiresAt: null,
      })
      Object.assign(instance, { session: { editText } })
      try {
        await expect(
          instance.send({
            requestId: 'bad-edit',
            to: chat,
            text: 'after',
            editTo: { id: 'incoming', sender },
          }),
        ).rejects.toThrow('own text')
        expect(editText).not.toHaveBeenCalled()
      } finally {
        Object.assign(instance, { session: undefined })
        status.mockRestore()
      }
    },
  )
})
