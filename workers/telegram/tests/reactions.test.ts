import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { sendReaction as sdkSendReaction } from '@mtcute/core/methods.js'
import type { ITelegramClient } from '@mtcute/core'

it('rejects unsupported reactions before creating an uncertain send receipt', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-reactions'),
    async instance => {
      instance.journal.record({
        id: '7',
        chat: '42',
        sender: '99',
        timestamp: Date.now(),
        fromMe: false,
        text: '',
      })
      const sendReaction = vi.fn().mockResolvedValue(null)
      const call = vi.fn().mockResolvedValue({
        _: 'messages.availableReactions',
        reactions: [{ reaction: '❤️' }],
      })
      Object.assign(instance, {
        state: { connected: true },
        client: { call, sendReaction },
      })
      const request = {
        requestId: 'unsupported-reaction',
        to: '42',
        text: '',
        replyTo: { id: '7', sender: '99' },
        reaction: '🥳',
      }
      await expect(instance.send(request)).rejects.toThrow(
        'Telegram does not support this reaction',
      )
      expect(instance.journal.result(request.requestId)).toBeNull()
      expect(sendReaction).not.toHaveBeenCalled()
      expect(
        await instance.send({
          ...request,
          requestId: 'supported-reaction',
          reaction: '❤️',
        }),
      ).toMatchObject({ state: 'submitted', messageId: '7' })
      expect(sendReaction).toHaveBeenCalledOnce()
      expect(sendReaction).toHaveBeenCalledWith(
        expect.objectContaining({ shouldDispatch: true }),
      )
    },
  )
})

it('dispatches reaction-only SDK responses into the message journal, including removal', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('synthetic-reaction-updates'),
    async instance => {
      instance.journal.record({
        id: '7',
        chat: '42',
        sender: '99',
        timestamp: Date.now(),
        fromMe: false,
        text: 'Target',
      })
      let results = [{ reaction: { _: 'reactionEmoji', emoticon: '❤️' }, count: 1 }]
      const handleClientUpdate = vi.fn((updates, noDispatch) => {
        if (noDispatch) return
        for (const update of updates.updates) {
          instance.journal.reactions(
            '42',
            String(update.msgId),
            update.reactions.results.map((result: (typeof results)[number]) => ({
              emoji: result.reaction.emoticon,
              count: result.count,
            })),
          )
        }
      })
      const client = {
        storage: { peers: { getById: async () => ({ _: 'inputPeerSelf' }) } },
        call: vi.fn(async request =>
          request._ === 'messages.getAvailableReactions'
            ? { _: 'messages.availableReactions', reactions: [{ reaction: '❤️' }] }
            : {
                _: 'updates',
                updates: [
                  { _: 'updateMessageReactions', msgId: 7, reactions: { results } },
                ],
                users: [],
                chats: [],
                date: 0,
                seq: 0,
              },
        ),
        handleClientUpdate,
        sendReaction: (params: Parameters<typeof sdkSendReaction>[1]) =>
          sdkSendReaction(client as unknown as ITelegramClient, params),
      }
      Object.assign(instance, { state: { connected: true }, client })
      const request = {
        requestId: 'reaction-update',
        to: '42',
        text: '',
        replyTo: { id: '7', sender: '99' },
        reaction: '❤️',
      }
      expect(await instance.send(request)).toMatchObject({ state: 'submitted' })
      expect(instance.journal.message('42', '7')?.reactions).toEqual([
        { emoji: '❤️', count: 1 },
      ])
      results = []
      expect(
        await instance.send({
          ...request,
          requestId: 'reaction-removal',
          reaction: '',
        }),
      ).toMatchObject({ state: 'submitted' })
      expect(instance.journal.message('42', '7')?.reactions).toEqual([])
      expect(handleClientUpdate).toHaveBeenCalledTimes(2)
    },
  )
})
