import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { Long, type tl } from '@mtcute/core'
import type { TelegramCatalog } from '../src/catalog'
type Client = Parameters<TelegramCatalog['search']>[0]
const sticker = (id: number, mimeType: string): tl.RawDocument => ({
  _: 'document',
  id: Long.fromNumber(id),
  accessHash: Long.ONE,
  fileReference: new Uint8Array([1]),
  date: 1,
  mimeType,
  size: 100,
  dcId: 2,
  attributes: [
    {
      _: 'documentAttributeSticker',
      alt: '😀',
      stickerset: { _: 'inputStickerSetEmpty' },
    },
  ],
})

it('lists public installed pack names without exposing access hashes', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('packs-list'), async instance => {
    const call = vi.fn().mockResolvedValue({
      _: 'messages.allStickers',
      sets: [
        { shortName: 'HappyPack', title: 'Happy', count: 3, accessHash: 'secret' },
        { shortName: 'EmojiPack', emojis: true },
      ],
    })
    expect(await instance.catalog.packs({ call } as unknown as Client)).toEqual([
      { id: 'HappyPack', title: 'Happy', count: 3 },
    ])
    expect(call).toHaveBeenCalledWith({ _: 'messages.getAllStickers', hash: Long.ZERO })
  })
})

it('loads a whole pack for offline caching and filters incompatible WhatsApp formats', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('packs-members'), async instance => {
    const call = vi.fn().mockResolvedValue({
      _: 'messages.stickerSet',
      documents: [
        sticker(1, 'image/webp'),
        sticker(2, 'application/x-tgsticker'),
        sticker(3, 'video/webm'),
      ],
    })
    const client = { call } as unknown as Client
    const all = await instance.catalog.search(client, {
      kind: 'sticker',
      query: '',
      pack: 'HappyPack',
    })
    expect(all.items).toHaveLength(3)
    expect(all.nextOffset).toBeNull()
    expect(call).toHaveBeenCalledWith({
      _: 'messages.getStickerSet',
      stickerset: { _: 'inputStickerSetShortName', shortName: 'HappyPack' },
      hash: 0,
    })
    const compatible = await instance.catalog.search(client, {
      kind: 'sticker',
      query: '',
      pack: 'HappyPack',
      compatibleWith: 'whatsapp',
    })
    expect(compatible.items.map(item => item.mimeType)).toEqual(['image/webp'])
    expect(instance.catalog.metadata(compatible.items[0].id).key).toBe('document:1')
    expect(() => instance.catalog.metadata(crypto.randomUUID())).toThrow('expired')
    await expect(
      instance.catalog.search(client, {
        kind: 'sticker',
        query: '',
        pack: 'https://example.invalid',
      }),
    ).rejects.toThrow('Invalid sticker pack')
  })
})
