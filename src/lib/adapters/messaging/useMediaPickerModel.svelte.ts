// SVELTE
import { tick } from 'svelte'
// CACHE
import { createMediaCache } from '#lib/messaging/media-cache.js'
// TYPES
import type { ChatTransport } from '#lib/messaging/chat-transport.js'
import type { MediaCatalogItem, MediaCatalogKind, MediaCatalogPage, MediaCatalogQuery, MediaPickerModel, StickerPack } from '#lib/messaging/media-catalog.js'

type SavedPage = { page: MediaCatalogPage; at: number }
const FRESH = 10 * 60_000

/** Own one account's cached catalogue, bounded previews and instant selection.
 * @param options Account-bound transport, operator cache scope and optimistic send action.
 * @returns Controlled picker state and lifecycle cleanup.
 * @remarks Search revisions reject stale pages; closing retains previews and offline pack data.
 */
export function createMediaPickerModel(options: {
  transport: ChatTransport
  cacheScope?: string
  available: () => boolean
  send: (item: MediaCatalogItem, url: string | undefined, resolve: (refresh?: boolean) => Promise<MediaCatalogItem>) => () => void
}): MediaPickerModel & { dispose(): void } {
  let open = $state(false), kind = $state<MediaCatalogKind>('gif'), query = $state(''), pack = $state('')
  let items = $state<MediaCatalogItem[]>([]), packs = $state<StickerPack[]>([])
  let loading = $state(false), error = $state(''), saving = $state(false), cacheStatus = $state('')
  let cacheBytes = $state<number | null>(null), clearingCache = $state(false)
  let nextOffset = $state<string | null>(null), urls = $state<Record<string, string>>({}), previewErrors = $state<Record<string, string>>({})
  let revision = 0, disposed = false, pageTime = 0, cacheRevision = 0
  let debounce: ReturnType<typeof setTimeout> | undefined
  const cache = createMediaCache(options.cacheScope, bytes => { if (!disposed) cacheBytes = bytes })
  const pages = new Map<string, SavedPage>()
  const origins = new Map<string, { input: MediaCatalogQuery; at: number }>()
  const media = new Map<string, { url: string; size: number; blob: Blob }>()
  const previews = new Map<string, Promise<void>>()
  const waiters: (() => void)[] = []
  let fetching = 0, memoryBytes = 0
  const intent = (): MediaCatalogQuery => ({ kind, query: query.trim(), ...(pack ? { pack } : {}), language: typeof navigator === 'undefined' ? 'en' : navigator.language.split('-')[0] })
  const pageKey = (input: MediaCatalogQuery): string => `page:${JSON.stringify(input)}`

  /** Invalidate obsolete search responses while retaining reusable preview bytes. */
  function clear(): void {
    revision++; clearTimeout(debounce); debounce = undefined
    items = []; loading = false; error = ''; nextOffset = null; urls = {}; previewErrors = {}
  }
  /** Bind cached URLs to the current page's expiring opaque identifiers. */
  function bindUrls(): void { urls = Object.fromEntries(items.flatMap(item => { const stored = media.get(item.key); return stored ? [[item.id, stored.url]] : [] })) }

  /** Fetch one page, painting cached results immediately and refreshing stale references in the background. */
  async function load(append = false, force = false): Promise<void> {
    if (disposed || !open || loading || !options.transport.searchMedia) return
    const current = revision, epoch = cacheRevision, input = { ...intent(), ...(append && nextOffset ? { offset: nextOffset } : {}) }, key = pageKey(input)
    loading = true; error = ''
    const apply = (saved: SavedPage): void => {
      const merged = new Map((append ? items : []).map(item => [item.key, item]))
      for (const item of saved.page.items) { merged.set(item.key, item); origins.set(item.key, { input, at: saved.at }) }
      items = [...merged.values()]; nextOffset = saved.page.nextOffset; pageTime = saved.at; bindUrls()
    }
    try {
      const saved = pages.get(key) ?? await cache.get<SavedPage>(key)
      if (disposed || current !== revision || !open) return
      if (saved) { pages.set(key, saved); apply(saved) }
      if (!force && saved && (Date.now() - saved.at < FRESH || (typeof navigator !== 'undefined' && !navigator.onLine))) return
      const page = await options.transport.searchMedia(input), fresh = { page, at: Date.now() }
      pages.set(key, fresh); if (pages.size > 40) pages.delete(pages.keys().next().value!)
      if (epoch === cacheRevision && !clearingCache) void cache.put(key, fresh)
      if (!disposed && current === revision && open) apply(fresh)
    } catch (cause) { if (!disposed && current === revision) error = items.length ? 'Showing saved results. Connect to refresh.' : cause instanceof Error ? cause.message : 'Media search failed. Try again.' }
    finally { if (current === revision) loading = false }
  }

  /** Debounce typing after clearing obsolete results; cached pages avoid another preview download. */
  function search(value: string): void { query = value.slice(0, 200); pack = ''; clear(); loading = true; debounce = setTimeout(() => { loading = false; void load() }, 200) }

  /** Fetch each stable media key once, with at most four transfers and a bounded memory/disk cache. */
  async function preview(item: MediaCatalogItem): Promise<void> {
    if (disposed) return
    if (media.has(item.key)) { bindUrls(); return }
    const existing = previews.get(item.key); if (existing) return existing
    const epoch = cacheRevision
    const task = (async () => {
      if (fetching >= 4) await new Promise<void>(resolve => waiters.push(resolve))
      fetching++
      try {
        if (disposed) return
        let blob = await cache.get<Blob>(`media:${item.key}`)
        if (!blob) {
          if (!options.transport.catalogMedia) return
          const bytes = await options.transport.catalogMedia(item.id)
          blob = new Blob([Uint8Array.from(bytes)], { type: item.mimeType })
          if (epoch === cacheRevision && !clearingCache) void cache.put(`media:${item.key}`, blob, blob.size)
        }
        if (disposed) return
        while (memoryBytes + blob.size > 48 * 1024 * 1024 && media.size) {
          const [key, old] = media.entries().next().value!; URL.revokeObjectURL(old.url); memoryBytes -= old.size; media.delete(key)
        }
        media.set(item.key, { url: URL.createObjectURL(blob), size: blob.size, blob }); memoryBytes += blob.size
        previewErrors[item.id] = ''; bindUrls()
      } catch { if (!disposed) previewErrors[item.id] = 'Preview unavailable' }
      finally { fetching--; waiters.shift()?.(); previews.delete(item.key) }
    })()
    previews.set(item.key, task)
    return task
  }

  /** Animate a tile into an optimistic message; network work never holds the transition open. */
  async function select(item: MediaCatalogItem, source?: HTMLElement): Promise<void> {
    if (!options.available() || !items.some(row => row.id === item.id)) return
    const origin = origins.get(item.key)
    const input = origin?.input ?? intent(), selectedAt = origin?.at ?? pageTime, url = media.get(item.key)?.url
    const resolve = async (refresh = false): Promise<MediaCatalogItem> => {
      if (!refresh && Date.now() - selectedAt < FRESH) return item
      const page = await options.transport.searchMedia!(input)
      const fresh = page.items.find(row => row.key === item.key)
      if (!fresh) throw new Error('This saved result is no longer available. Search for it again.')
      return fresh
    }
    let release: (() => void) | undefined
    const update = async (): Promise<void> => { if (source) source.style.viewTransitionName = ''; close(); release = options.send(item, url, resolve); await tick() }
    if (source && url && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      source.style.viewTransitionName = 'catalog-send'
      const transition = document.startViewTransition(update)
      try { await transition.finished } catch { /* Unsupported snapshots still commit the send exactly once. */ }
      finally { source.style.viewTransitionName = ''; release?.() }
    } else { await update(); release?.() }
  }

  /** Load installed pack names independently; cached packs remain browseable offline. */
  async function loadPacks(): Promise<void> {
    if (!options.transport.stickerPacks) return
    const epoch = cacheRevision
    const saved = await cache.get<{ packs: StickerPack[]; at: number }>('packs')
    if (disposed) return
    if (saved) packs = saved.packs
    if (saved && Date.now() - saved.at < FRESH) return
    try { const result = await options.transport.stickerPacks(); if (!disposed) packs = result; if (epoch === cacheRevision && !clearingCache) void cache.put('packs', { packs: result, at: Date.now() }) } catch { /* Sticker search stays available if the pack list cannot refresh. */ }
  }

  /** Download the selected pack for subsequent offline browsing, bounded by the shared cache budget. */
  async function savePack(): Promise<void> {
    if (!pack || saving || clearingCache) return
    saving = true; cacheStatus = ''
    const selectedPack = pack, epoch = cacheRevision, members = [...items]
    const key = pageKey(intent()), savedPage = $state.snapshot({ page: { items: members, nextOffset }, at: pageTime })
    try {
      // Keep the pack discoverable offline when saving it again after clearing device storage.
      await cache.put('packs', { packs: $state.snapshot(packs), at: Date.now() })
      if (epoch !== cacheRevision || clearingCache) return
      await cache.put(key, savedPage)
      if (epoch !== cacheRevision || clearingCache) return
      await Promise.all(members.map(preview))
      const saved = (await Promise.all(members.map(async item => {
        const key = `media:${item.key}`
        if (await cache.get<Blob>(key)) return true
        // Explicit saving can restore cleared previews directly from the visible session.
        const stored = media.get(item.key)
        if (!stored || epoch !== cacheRevision || clearingCache) return false
        await cache.put(key, stored.blob, stored.size)
        return Boolean(await cache.get<Blob>(key))
      }))).filter(Boolean).length
      if (selectedPack === pack) cacheStatus = saved === members.length ? `${saved} stickers saved on this device` : saved ? `${saved} of ${members.length} saved. Retry when connected.` : 'Previews ready for this session. Browser storage is unavailable.'
    } finally { saving = false }
  }
  /** Close without discarding cached pages, search text, or preview URLs. */
  function close(): void { open = false; revision++; clearTimeout(debounce); loading = false }

  /** Clear saved content while keeping visible previews usable without downloading them again.
   * @returns Completion after the scoped disk cache and its usage display have refreshed.
   */
  async function clearCache(): Promise<void> {
    if (clearingCache) return
    clearingCache = true; cacheRevision++
    try { await cache.clear(); pages.clear(); cacheBytes = await cache.usage(); cacheStatus = 'Device cache cleared' }
    finally { clearingCache = false }
  }

  return {
    get open() { return open }, get kind() { return kind }, get query() { return query }, get items() { return items },
    get loading() { return loading }, get error() { return error }, get hasMore() { return nextOffset !== null },
    get urls() { return urls }, get previewErrors() { return previewErrors }, get packs() { return packs }, get pack() { return pack }, get saving() { return saving }, get cacheStatus() { return cacheStatus },
    get cacheBytes() { return cacheBytes }, get clearingCache() { return clearingCache },
    show(value) { if (disposed) return; const changed = kind !== value; kind = value; if (changed) { query = ''; pack = ''; clear() } open = true; void cache.usage().then(bytes => { if (!disposed) cacheBytes = bytes }); if (kind === 'sticker') void loadPacks(); if (changed || !items.length || Date.now() - pageTime >= FRESH) void load() },
    choosePack(id) { pack = id; query = ''; cacheStatus = ''; clear(); void load() },
    close, search, preview, select, savePack, clearCache,
    more: () => nextOffset ? load(true) : Promise.resolve(), retry: () => load(items.length > 0, true),
    dispose() { disposed = true; close(); for (const entry of media.values()) URL.revokeObjectURL(entry.url); media.clear() },
  }
}
