import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

it('uses Telegram editMessage and deduplicates repeated edits', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('synthetic-edit'), async instance => {
    instance.journal.record({
      id: '7',
      chat: '42',
      sender: '99',
      timestamp: Date.now(),
      fromMe: true,
      text: 'before',
    })
    const editMessage = vi.fn().mockResolvedValue(null)
    Object.assign(instance, { state: { connected: true }, client: { editMessage } })
    const request = {
      requestId: 'edit-one',
      to: '42',
      text: 'after',
      editTo: { id: '7', sender: '99' },
    }
    expect(await instance.send(request)).toMatchObject({
      state: 'submitted',
      messageId: '7',
    })
    await instance.send(request)
    expect(editMessage).toHaveBeenCalledExactlyOnceWith({
      chatId: 42,
      message: 7,
      text: 'after',
    })
    await expect(
      instance.send({
        ...request,
        requestId: 'bad-edit',
        editTo: { id: '7', sender: '42' },
      }),
    ).rejects.toThrow('own text')
  })
})
