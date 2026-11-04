import { runInDurableObject, evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { Long, type tl } from '@mtcute/core'
import type { TelegramCatalog } from '../src/catalog'

const document = (id: number, mimeType = 'image/webp'): tl.RawDocument => ({
  _: 'document',
  id: Long.fromNumber(id),
  accessHash: Long.fromNumber(98765),
  fileReference: new Uint8Array([1, 2, 3]),
  date: 1,
  mimeType,
  size: 100,
  dcId: 2,
  attributes: [
    { _: 'documentAttributeImageSize', w: 512, h: 512 },
    ...(mimeType === 'image/webp'
      ? [
          {
            _: 'documentAttributeSticker' as const,
            alt: '😀',
            stickerset: { _: 'inputStickerSetEmpty' as const },
          },
        ]
      : [{ _: 'documentAttributeAnimated' as const }]),
  ],
})
type Client = Parameters<TelegramCatalog['search']>[0]

describe('Telegram media catalogue', () => {
  it('searches keywords and emoji with native pagination and keeps provider references private', async () => {
    const stub = env.ACCOUNTS.getByName('catalog-search')
    await runInDurableObject(stub, async instance => {
      const call = vi.fn().mockResolvedValue({
        _: 'messages.foundStickers',
        stickers: [document(1)],
        nextOffset: 24,
      })
      const page = await instance.catalog.search({ call } as unknown as Client, {
        kind: 'sticker',
        query: 'happy 😀',
        language: 'en',
      })
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({
          _: 'messages.searchStickers',
          q: 'happy 😀',
          emoticon: '😀',
          langCode: ['en'],
          limit: 24,
          offset: 0,
        }),
      )
      expect(page).toMatchObject({
        items: [{ kind: 'sticker', title: '😀 sticker', mimeType: 'image/webp' }],
        nextOffset: '24',
      })
      expect(JSON.stringify(page)).not.toMatch(/accessHash|fileReference|fileId|98765/)
      expect(instance.catalog.attachment(page.items[0].id)).toBeNull()
    })
  })

  it('stages only explicit selections, retains them across eviction and isolates accounts', async () => {
    const stub = env.ACCOUNTS.getByName('catalog-durable')
    const selected = await runInDurableObject(stub, async instance => {
      const call = vi
        .fn()
        .mockResolvedValue({ _: 'messages.recentStickers', stickers: [document(2)] })
      const page = await instance.catalog.search({ call } as unknown as Client, {
        kind: 'sticker',
        query: '',
      })
      const selected = await instance.catalog.stage(page.items[0].id)
      expect(selected.id).not.toBe(page.items[0].id)
      expect(selected.content.kind).toBe('sticker')
      expect(instance.journal.outbox()).toEqual([])
      return selected
    })
    await evictDurableObject(stub)
    await runInDurableObject(stub, instance =>
      expect(instance.catalog.attachment(selected.id)).toMatchObject({
        type: 'sticker',
      }),
    )
    await runInDurableObject(
      env.ACCOUNTS.getByName('catalog-other'),
      async instance => {
        expect(instance.catalog.attachment(selected.id)).toBeNull()
        await expect(instance.catalog.stage(selected.id)).rejects.toThrow('expired')
      },
    )
  })

  it('uses the configured GIF bot and supports both native and CDN results', async () => {
    await runInDurableObject(env.ACCOUNTS.getByName('catalog-gifs'), async instance => {
      const call = vi
        .fn()
        .mockResolvedValueOnce({ gifSearchUsername: 'configured_gifs' })
        .mockResolvedValueOnce({
          results: [
            {
              _: 'botInlineMediaResult',
              type: 'gif',
              id: 'native',
              document: document(3, 'video/mp4'),
            },
            {
              _: 'botInlineResult',
              type: 'gif',
              id: 'external',
              title: 'Happy dance',
              content: {
                _: 'webDocumentNoProxy',
                url: 'https://media.tenor.com/example.mp4',
                mimeType: 'video/mp4',
                attributes: [],
              },
            },
            {
              _: 'botInlineResult',
              type: 'gif',
              id: 'unsafe',
              content: {
                url: 'http://127.0.0.1/private',
                mimeType: 'video/mp4',
                attributes: [],
              },
            },
          ],
          nextOffset: 'page-2',
        })
      const resolveUser = vi
        .fn()
        .mockResolvedValue({ _: 'inputUser', userId: 1, accessHash: Long.ONE })
      const page = await instance.catalog.search(
        { call, resolveUser } as unknown as Client,
        { kind: 'gif', query: 'happy' },
      )
      expect(resolveUser).toHaveBeenCalledWith('configured_gifs')
      expect(call.mock.calls[1][0]).toMatchObject({
        _: 'messages.getInlineBotResults',
        peer: { _: 'inputPeerEmpty' },
        query: 'happy',
        offset: '',
      })
      expect(page.items).toHaveLength(2)
      expect(page.nextOffset).toBe('page-2')
      const selection = await instance.catalog.stage(page.items[1].id)
      expect(selection.content).toMatchObject({
        kind: 'video',
        animated: true,
        mimeType: 'video/mp4',
      })
      expect(instance.catalog.attachment(selection.id)).toMatchObject({
        type: 'video',
        isAnimated: true,
      })
    })
  })

  it('shows saved GIFs and rejects expired selections and oversized previews', async () => {
    await runInDurableObject(
      env.ACCOUNTS.getByName('catalog-limits'),
      async (instance, state) => {
        const call = vi.fn().mockResolvedValue({
          _: 'messages.savedGifs',
          gifs: Array.from({ length: 25 }, (_, i) => document(i + 100, 'video/mp4')),
        })
        const page = await instance.catalog.search({ call } as unknown as Client, {
          kind: 'gif',
          query: '',
        })
        expect(page.items).toHaveLength(24)
        expect(page.nextOffset).toBe('saved:24')
        const client = {
          async *downloadAsIterable() {
            yield new Uint8Array(8 * 1024 * 1024 + 1)
          },
        } as unknown as Client
        await expect(
          instance.catalog.preview(client, page.items[0].id),
        ).rejects.toThrow('8 MiB')
        state.storage.sql.exec('UPDATE bridge_catalog SET expires=0')
        await expect(instance.catalog.stage(page.items[0].id)).rejects.toThrow(
          'expired',
        )
      },
    )
  })
})
