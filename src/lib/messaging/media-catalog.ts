/** Account-scoped search contract. Provider file references stay inside the bridge. */
export type MediaCatalogKind = 'gif' | 'sticker'

export interface MediaCatalogQuery {
  kind: MediaCatalogKind
  query: string
  offset?: string
  language?: string
  pack?: string
  compatibleWith?: 'whatsapp'
}

export interface MediaCatalogItem {
  id: string
  key: string
  kind: MediaCatalogKind
  title: string
  mimeType: string
  width: number
  height: number
  byteLength?: number
}

/** Public pack names are safe to cache; access hashes remain in the bridge. */
export interface StickerPack {
  id: string
  title: string
  count: number
}

/** A catalogue selection is visible before its immutable send receives an acknowledgement. */
export interface CatalogSend {
  id: string
  chat: string
  item: MediaCatalogItem
  url?: string
  timestamp: number
  state: 'pending' | 'submitted' | 'uncertain' | 'failed'
  messageId: string
  error: string
  transitioning: boolean
}

export interface MediaCatalogPage {
  items: MediaCatalogItem[]
  nextOffset: string | null
}

/** Presentation state owned by the account adapter, including private preview URLs. */
export interface MediaPickerModel {
  readonly open: boolean
  readonly kind: MediaCatalogKind
  readonly query: string
  readonly items: MediaCatalogItem[]
  readonly loading: boolean
  readonly error: string
  readonly hasMore: boolean
  readonly urls: Record<string, string>
  readonly previewErrors: Record<string, string>
  readonly packs: StickerPack[]
  readonly pack: string
  readonly saving: boolean
  readonly cacheStatus: string
  readonly cacheBytes: number | null
  readonly clearingCache: boolean
  choosePack(id: string): void
  savePack(): Promise<void>
  clearCache(): Promise<void>
  show(kind: MediaCatalogKind): void
  close(): void
  search(query: string): void
  more(): Promise<void>
  retry(): Promise<void>
  preview(item: MediaCatalogItem): Promise<void>
  select(item: MediaCatalogItem, source?: HTMLElement): Promise<void>
}
