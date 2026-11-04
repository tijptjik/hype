import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { projectMessage } from '../src/projection'

it('sends an exact native excerpt with UTF-16 offset and retains retry identity', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-selected-quote'),
    async instance => {
      const original = 'Hello 🥖\nBread tomorrow?'
      instance.journal.record({
        id: '7',
        chat: '42',
        sender: '42',
        timestamp: 1,
        fromMe: false,
        text: original,
      })
      const sendText = vi.fn().mockResolvedValue(null)
      Object.assign(instance, { state: { connected: true }, client: { sendText } })
      const quote = { text: 'Bread', offset: original.indexOf('Bread') }
      const request = {
        requestId: 'quoted-one',
        to: '42',
        text: 'Yes',
        replyTo: { id: '7', sender: '42', quote },
      }
      expect(await instance.send(request)).toMatchObject({
        state: 'submitted',
        request,
      })
      await instance.send(request)
      expect(sendText).toHaveBeenCalledExactlyOnceWith(
        42,
        'Yes',
        expect.objectContaining({
          replyTo: 7,
          quote: { text: 'Bread', entities: [] },
          quoteOffset: 9,
        }),
      )
      await expect(
        instance.send({
          ...request,
          replyTo: { ...request.replyTo, quote: { text: 'tomorrow', offset: 15 } },
        }),
      ).rejects.toThrow('different send')
      await expect(
        instance.send({
          ...request,
          requestId: 'bad-offset',
          replyTo: { ...request.replyTo, quote: { ...quote, offset: 8 } },
        }),
      ).rejects.toThrow('no longer matches')
      await expect(
        instance.send({ ...request, requestId: 'other-chat', to: '43' }),
      ).rejects.toThrow('this conversation')
      await expect(
        instance.send({
          ...request,
          requestId: 'bad-reaction',
          reaction: '👍',
          text: '',
        }),
      ).rejects.toThrow('selected-text quote')
      expect(instance.journal.result('bad-offset')).toBeNull()
      expect(sendText).toHaveBeenCalledTimes(1)
    },
  )
})

it('preserves native quote excerpts, sender and cross-chat origin in the projection', () => {
  const projected = projectMessage({
    id: 8,
    chat: { id: 42 },
    sender: { id: 99, displayName: 'Synthetic operator' },
    text: 'Yes',
    date: new Date(1000),
    isOutgoing: true,
    replyToMessage: {
      id: 7,
      sender: { id: 42, displayName: 'Synthetic recipient' },
      quoteText: 'Bread',
      quoteOffset: 9,
      chat: { id: 43 },
    },
  } as Parameters<typeof projectMessage>[0])
  expect(projected.content?.quoted).toEqual({
    id: '7',
    sender: '42',
    senderName: 'Synthetic recipient',
    text: 'Bread',
    offset: 9,
    chat: '43',
    kind: 'text',
  })
})
