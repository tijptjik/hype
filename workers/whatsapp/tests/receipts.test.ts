import { runInDurableObject, evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('persists early receipts, replays changes and never downgrades read to delivered', async () => {
  const stub = env.ACCOUNTS.getByName('synthetic-receipts')
  await runInDurableObject(stub, async instance => {
    const message = {
      id: 'one',
      chat: '15555550100@s.whatsapp.net',
      sender: 'self',
      timestamp: 1,
      fromMe: true,
      text: 'hello',
      payload: JSON.stringify({ message: { conversation: 'hello' } }),
    }
    instance.journal.receipt(
      JSON.stringify({ chats: [message.chat], ids: ['one'], state: 'delivered' }),
    )
    await instance.journal.receive(
      JSON.stringify([
        message,
        { ...message, id: 'two' },
        { ...message, id: 'incoming', fromMe: false },
        { ...message, chat: 'other' },
      ]),
    )
    expect(
      instance.journal
        .inbox(0, 100)
        .find(m => m.chat === message.chat && m.id === 'one')?.delivery,
    ).toBe('delivered')
    const cursor = instance.journal.inbox(0, 100).at(-1)!.sequence
    instance.journal.receipt(
      JSON.stringify({
        chats: [message.chat],
        ids: ['one', 'incoming'],
        state: 'read',
      }),
    )
    instance.journal.receipt(
      JSON.stringify({ chats: [message.chat], ids: ['one'], state: 'delivered' }),
    )
    const changes = instance.journal.inbox(cursor, 100)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      id: 'one',
      delivery: 'read',
      timestamp: 1,
      text: 'hello',
    })
    expect(
      instance.journal.inbox(0, 100).find(m => m.id === 'incoming')?.delivery,
    ).toBeUndefined()
    expect(
      instance.journal.inbox(0, 100).find(m => m.chat === 'other')?.delivery,
    ).toBeUndefined()
  })
  await evictDurableObject(stub)
  await runInDurableObject(stub, instance =>
    expect(
      instance.journal.inbox(0, 100).find(m => m.id === 'one' && m.chat !== 'other')
        ?.delivery,
    ).toBe('read'),
  )
})
