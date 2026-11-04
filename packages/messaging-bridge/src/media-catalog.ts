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
export interface StickerPack { id: string; title: string; count: number }


export interface MediaCatalogPage { items: MediaCatalogItem[]; nextOffset: string | null }
