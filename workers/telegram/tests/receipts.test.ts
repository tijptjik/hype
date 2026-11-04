import { runInDurableObject, evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { avatarImage } from '../src/avatar'
import type { TelegramClient } from '@mtcute/core/client.js'
import type { ChatPhoto } from '@mtcute/core'

it('keeps read watermarks scoped, durable and monotonic across edits/history', async () => {
  const stub = env.ACCOUNTS.getByName('synthetic-read-watermark')
  await runInDurableObject(stub, instance => {
    instance.journal.readThrough('42', 7)
    const message = {
      id: '7',
      chat: '42',
      sender: 'self',
      timestamp: 100,
      fromMe: true,
      text: 'hello',
    }
    instance.journal.record(message)
    instance.journal.record({ ...message, id: '8' })
    instance.journal.record({ ...message, chat: '43' })
    instance.journal.record({ ...message, id: '6', fromMe: false })
    expect(instance.journal.message('42', '7')?.delivery).toBe('read')
    expect(instance.journal.message('42', '8')?.delivery).toBe('sent')
    expect(instance.journal.message('43', '7')?.delivery).toBe('sent')
    expect(instance.journal.message('42', '6')?.delivery).toBeUndefined()
    instance.journal.readThrough('42', 8)
    instance.journal.readThrough('42', 1)
    instance.journal.record({ ...message, id: '8', editedAt: 200, text: 'edited' })
    instance.journal.record({ ...message, id: '8' }, 'history')
    expect(instance.journal.message('42', '8')).toMatchObject({
      delivery: 'read',
      text: 'edited',
    })
  })
  await evictDurableObject(stub)
  await runInDurableObject(stub, instance =>
    expect(instance.journal.message('42', '8')?.delivery).toBe('read'),
  )
})

it('downloads the small photo rather than the blurred thumb and bounds image bytes', async () => {
  const small = { synthetic: '160px-location' }
  const photo = {
    small,
    get thumb() {
      throw new Error('Tiny preview must not be used')
    },
  } as unknown as ChatPhoto
  const client = {
    async *downloadAsIterable(location: unknown) {
      expect(location).toBe(small)
      yield new Uint8Array([255, 216, 255, 1, 2])
    },
  } as unknown as Pick<TelegramClient, 'downloadAsIterable'>
  expect(await avatarImage(client, photo)).toBe('data:image/jpeg;base64,/9j/AQI=')
  const oversized = {
    async *downloadAsIterable() {
      yield new Uint8Array(128 * 1024 + 1)
    },
  } as unknown as Pick<TelegramClient, 'downloadAsIterable'>
  expect(await avatarImage(oversized, photo)).toBeNull()
  expect(await avatarImage(client, null)).toBeNull()
})
