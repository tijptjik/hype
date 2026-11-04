// TELEGRAM
import { Document, Long, InputMedia, type tl } from '@mtcute/core'
import type { TelegramClient } from '@mtcute/core/client.js'
// BRIDGE
import { emptyContent } from './projection'
// TYPES
import type { BridgeAttachment } from '@hype/messaging-bridge/types'
import type {
  MediaCatalogItem,
  MediaCatalogPage,
  MediaCatalogQuery,
  StickerPack,
} from '@hype/messaging-bridge/media-catalog'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROVIDER MEDIA
// - webUrl
// - boundedBytes
// 2. ACCOUNT CATALOGUE
// - TelegramCatalog
// ---

const PAGE_SIZE = 24
const MEDIA_LIMIT = 8 * 1024 * 1024
type Source = { type: 'document'; fileId: string } | { type: 'web'; url: string }
interface Entry {
  item: MediaCatalogItem
  source: Source
}
type Client = Pick<TelegramClient, 'call' | 'resolveUser' | 'downloadAsIterable'>

/** Accept provider CDN media only; no browser-controlled URLs or redirects are fetched.
 * @param value URL supplied by Telegram's configured GIF bot.
 * @returns Valid HTTPS media URL, or null for unsupported destinations.
 */
function webUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !/(^|\.)(tenor\.com|giphy\.com)$/.test(url.hostname)
    )
      return null
    return url.href
  } catch {
    return null
  }
}

/** Bound the whole download even when a provider omits or misstates its size.
 * @param chunks Provider byte stream.
 * @returns At most eight MiB of media.
 */
async function boundedBytes(chunks: AsyncIterable<Uint8Array>): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = []
  let length = 0
  for await (const part of chunks) {
    length += part.byteLength
    if (length > MEDIA_LIMIT) throw new Error('Media exceeds 8 MiB')
    parts.push(part)
  }
  if (!length) throw new Error('Media is empty')
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result.buffer
}

/** Search references and selected attachments belong to one account's durable storage. */
export class TelegramCatalog {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS bridge_catalog (id TEXT PRIMARY KEY, entry TEXT NOT NULL, selected INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL)',
    )
  }

  /** Retain only bounded, short-lived search results; selected drafts have their own lifetime.
   * @param entry Private provider reference and public display metadata.
   * @param selected Whether the operator explicitly staged this result.
   * @returns Public item with a new opaque, account-local identifier.
   */
  private put(entry: Entry, selected = false): MediaCatalogItem {
    this.storage.sql.exec('DELETE FROM bridge_catalog WHERE expires<=?', Date.now())
    if (
      selected &&
      this.storage.sql
        .exec<{ count: number }>(
          'SELECT count(*) AS count FROM bridge_catalog WHERE selected=1',
        )
        .one().count >= 100
    )
      throw new Error('Too many pending media selections')
    const item = { ...entry.item, id: crypto.randomUUID() }
    this.storage.sql.exec(
      'INSERT INTO bridge_catalog VALUES (?,?,?,?)',
      item.id,
      JSON.stringify({ ...entry, item }),
      selected ? 1 : 0,
      Date.now() + (selected ? 86_400_000 : 900_000),
    )
    this.storage.sql.exec(
      'DELETE FROM bridge_catalog WHERE selected=0 AND id NOT IN (SELECT id FROM bridge_catalog WHERE selected=0 ORDER BY rowid DESC LIMIT 480)',
    )
    return item
  }

  /** Resolve opaque IDs inside this account, rejecting expired or foreign results.
   * @param id Catalogue identifier.
   * @param selected Require an explicitly staged result when sending.
   * @returns Private entry, or null when unavailable.
   */
  private get(id: string, selected = false): Entry | null {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid media selection')
    const row = this.storage.sql
      .exec<{ entry: string }>(
        'SELECT entry FROM bridge_catalog WHERE id=? AND expires>? AND selected>=?',
        id,
        Date.now(),
        selected ? 1 : 0,
      )
      .toArray()[0]
    return row ? (JSON.parse(row.entry) as Entry) : null
  }

  /** Convert a native document without publishing its access hash or file reference.
   * @param raw Native Telegram document.
   * @param kind Requested catalogue.
   * @returns Public result when its format can be previewed.
   */
  private document(
    raw: tl.TypeDocument,
    kind: MediaCatalogQuery['kind'],
    compatibleWith?: 'whatsapp',
  ): MediaCatalogItem | null {
    if (raw._ !== 'document') return null
    const mimeType = raw.mimeType
    if (
      compatibleWith === 'whatsapp' &&
      (kind === 'gif'
        ? mimeType !== 'video/mp4'
        : mimeType !== 'image/webp' || raw.size > 512 * 1024)
    )
      return null
    if (
      !(
        kind === 'sticker'
          ? ['image/webp', 'application/x-tgsticker', 'video/webm']
          : ['video/mp4', 'image/gif']
      ).includes(mimeType)
    )
      return null
    const sticker = raw.attributes.find(attr => attr._ === 'documentAttributeSticker')
    if (kind === 'sticker' && !sticker) return null
    const dimensions = raw.attributes.find(
      attr =>
        attr._ === 'documentAttributeImageSize' || attr._ === 'documentAttributeVideo',
    )
    const item: MediaCatalogItem = {
      id: '',
      key: `document:${raw.id}`,
      kind,
      title: sticker?.alt
        ? `${sticker.alt} sticker`
        : kind === 'gif'
          ? 'GIF'
          : 'Sticker',
      mimeType,
      byteLength: raw.size,
      width: dimensions?.w ?? 512,
      height: dimensions?.h ?? 512,
    }
    return this.put({
      item,
      source: { type: 'document', fileId: new Document(raw).fileId },
    })
  }

  /** Use Telegram's configured GIF bot or native keyword/emoji sticker search.
   * @param client Connected account client.
   * @param input Bounded search and continuation token; empty searches show saved/recent media.
   * @returns One page of opaque results and the provider's next offset.
   */
  async search(client: Client, input: MediaCatalogQuery): Promise<MediaCatalogPage> {
    if (
      !['gif', 'sticker'].includes(input.kind) ||
      typeof input.query !== 'string' ||
      input.query.length > 200 ||
      (input.offset?.length ?? 0) > 512 ||
      (input.language && !/^[a-zA-Z-]{2,20}$/.test(input.language))
    )
      throw new Error('Invalid media search')
    const query = input.query.trim()
    const items: MediaCatalogItem[] = []
    const add = (documents: tl.TypeDocument[]): void => {
      for (const raw of documents) {
        const item = this.document(raw, input.kind, input.compatibleWith)
        if (item) items.push(item)
      }
    }
    if (input.pack) {
      if (input.kind !== 'sticker' || !/^[A-Za-z0-9_]{1,64}$/.test(input.pack))
        throw new Error('Invalid sticker pack')
      const result = await client.call({
        _: 'messages.getStickerSet',
        stickerset: { _: 'inputStickerSetShortName', shortName: input.pack },
        hash: 0,
      })
      if (result._ === 'messages.stickerSet') add(result.documents.slice(0, 200))
      return { items, nextOffset: null }
    }
    if (input.kind === 'sticker') {
      if (input.offset && !/^\d{1,8}$/.test(input.offset))
        throw new Error('Invalid sticker offset')
      const offset = Number(input.offset || 0)
      if (!query) {
        const recent = await client.call({
          _: 'messages.getRecentStickers',
          hash: Long.ZERO,
        })
        const docs = recent._ === 'messages.recentStickers' ? recent.stickers : []
        add(docs.slice(offset, offset + PAGE_SIZE))
        return {
          items,
          nextOffset:
            docs.length > offset + PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
        }
      }
      // Telegram accepts words and emoji together; preserve emoji clusters and join with spaces.
      const emoticon = [
        ...query.matchAll(
          /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*/gu,
        ),
      ]
        .map(match => match[0])
        .join(' ')
      const result = await client.call({
        _: 'messages.searchStickers',
        q: query,
        emoticon,
        langCode: input.language ? [input.language] : [],
        offset,
        limit: PAGE_SIZE,
        hash: Long.ZERO,
      })
      if (result._ === 'messages.foundStickers')
        add(result.stickers.slice(0, PAGE_SIZE))
      return {
        items,
        nextOffset:
          result.nextOffset !== undefined && result.nextOffset > offset
            ? String(result.nextOffset)
            : null,
      }
    }
    if (!query && (!input.offset || input.offset.startsWith('saved:'))) {
      const offset = input.offset ? Number(input.offset.slice(6)) : 0
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
        throw new Error('Invalid saved GIF offset')
      const saved = await client.call({ _: 'messages.getSavedGifs', hash: Long.ZERO })
      if (saved._ === 'messages.savedGifs' && saved.gifs.length) {
        add(saved.gifs.slice(offset, offset + PAGE_SIZE))
        return {
          items,
          nextOffset:
            saved.gifs.length > offset + PAGE_SIZE
              ? `saved:${offset + PAGE_SIZE}`
              : null,
        }
      }
    }
    const config = await client.call({ _: 'help.getConfig' })
    if (!config.gifSearchUsername) throw new Error('Telegram GIF search is unavailable')
    const result = await client.call({
      _: 'messages.getInlineBotResults',
      bot: await client.resolveUser(config.gifSearchUsername),
      peer: { _: 'inputPeerEmpty' },
      query,
      offset: input.offset ?? '',
    })
    for (const raw of result.results.slice(0, 50)) {
      if (!['gif', 'mpeg4_gif'].includes(raw.type)) continue
      if (raw._ === 'botInlineMediaResult' && raw.document) {
        const item = this.document(raw.document, 'gif', input.compatibleWith)
        if (item) items.push(item)
      } else if (
        raw._ === 'botInlineResult' &&
        raw.content &&
        ['video/mp4', 'image/gif'].includes(raw.content.mimeType)
      ) {
        const url = webUrl(raw.content.url)
        if (
          !url ||
          (input.compatibleWith === 'whatsapp' && raw.content.mimeType !== 'video/mp4')
        )
          continue
        const dimensions = raw.content.attributes.find(
          attr =>
            attr._ === 'documentAttributeVideo' ||
            attr._ === 'documentAttributeImageSize',
        )
        items.push(
          this.put({
            source: { type: 'web', url },
            item: {
              id: '',
              key: `gif:${raw.id}`,
              kind: 'gif',
              title: raw.title?.slice(0, 100) || 'GIF',
              mimeType: raw.content.mimeType,
              width: dimensions?.w ?? 320,
              height: dimensions?.h ?? 240,
            },
          }),
        )
      }
    }
    return {
      items,
      nextOffset:
        result.nextOffset && result.nextOffset !== input.offset
          ? result.nextOffset
          : null,
    }
  }

  /** List the account's installed ordinary sticker packs using public short names.
   * @param client Connected Telegram client.
   * @returns Titles and identifiers for browser/offline navigation.
   */
  async packs(client: Client): Promise<StickerPack[]> {
    const result = await client.call({ _: 'messages.getAllStickers', hash: Long.ZERO })
    return result._ === 'messages.allStickers'
      ? result.sets
          .filter(set => !set.masks && !set.emojis && Boolean(set.shortName))
          .map(set => ({ id: set.shortName, title: set.title, count: set.count }))
      : []
  }

  /** Validate a cached reference before transferring a compatible file to another provider.
   * @param id Account-local result ID.
   * @returns Public format metadata; private source URLs remain here.
   */
  metadata(id: string): MediaCatalogItem {
    const entry = this.get(id)
    if (!entry) throw new Error('This result expired. Search again.')
    return entry.item
  }

  /** Download a result for private browser previews, never an arbitrary client URL.
   * @param client Connected account client.
   * @param id Opaque result ID.
   * @returns Bounded media bytes.
   */
  async preview(client: Client, id: string): Promise<ArrayBuffer> {
    const entry = this.get(id)
    if (!entry) throw new Error('This result expired. Search again.')
    if (entry.source.type === 'document')
      return boundedBytes(client.downloadAsIterable(entry.source.fileId))
    const url = webUrl(entry.source.url)
    if (!url) throw new Error('Media preview is unavailable')
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok || !response.body) throw new Error('Media preview is unavailable')
    const reader = response.body.getReader()
    // The reader is cancelled on a size error as well as normal completion.
    async function* chunks(): AsyncGenerator<Uint8Array> {
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) return
          yield part.value
        }
      } finally {
        await reader.cancel()
        reader.releaseLock()
      }
    }
    return boundedBytes(chunks())
  }

  /** Stage a durable provider reference without sending it.
   * @param id Opaque search-result ID.
   * @returns Attachment usable only in this account's explicit send path.
   */
  async stage(id: string): Promise<BridgeAttachment> {
    const entry = this.get(id)
    if (!entry) throw new Error('This result expired. Search again.')
    const item = this.put(entry, true)
    const content = emptyContent(item.kind === 'gif' ? 'video' : 'sticker')
    content.mimeType = item.mimeType
    content.fileName = item.title
    content.animated = item.kind === 'gif'
    await this.storage.sync()
    return { id: item.id, content }
  }

  /** Release an acknowledged selection; the send journal retains its immutable result.
   * @param id Confirmed attachment identifier.
   * @returns Nothing; uncertain sends retain their attachment until expiry.
   */
  release(id: string): void {
    this.storage.sql.exec('DELETE FROM bridge_catalog WHERE id=? AND selected=1', id)
  }

  /** Resolve only staged references; ordinary upload IDs continue through the upload journal.
   * @param id Opaque staged attachment ID.
   * @returns Native media preserving GIF and sticker formats, or null for an upload.
   */
  attachment(
    id: string,
  ):
    | ReturnType<typeof InputMedia.animation>
    | ReturnType<typeof InputMedia.sticker>
    | null {
    const entry = this.get(id, true)
    if (!entry) return null
    const source =
      entry.source.type === 'document' ? entry.source.fileId : entry.source.url
    return entry.item.kind === 'gif'
      ? InputMedia.animation(source)
      : InputMedia.sticker(source)
  }
}
