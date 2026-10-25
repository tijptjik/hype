/** Public datasets have independent retention from authorization-scoped Hype resources. */
export const SOURCE_TTL_MS = 24 * 60 * 60 * 1000
export interface SourcePersistence {
  read(key: string): Promise<unknown>
  write(key: string, value: unknown): Promise<void>
}
type Entry = { expiresAt: number; value: unknown }

/** Browser Cache Storage avoids localStorage's small quota for whole datasets. */
export const browserSourcePersistence: SourcePersistence = {
  async read(key) {
    if (typeof caches === 'undefined') return undefined
    const cache = await caches.open('hype-third-party-v1')
    const response = await cache.match(key)
    return response?.json()
  },
  async write(key, value) {
    if (typeof caches === 'undefined') return
    const cache = await caches.open('hype-third-party-v1')
    await cache.put(key, new Response(JSON.stringify(value)))
  },
}

/** Shared public source retention; no private Hype records belong here. */
export class SourceCache {
  private entries = new Map<string, Entry>()
  private pending = new Map<string, Promise<unknown>>()
  constructor(
    private persistence: SourcePersistence = browserSourcePersistence,
    private now: () => number = Date.now,
  ) {}

  /** Load a validated dataset once per day, coalescing concurrent consumers.
   * @param identity Provider, absolute manifest URL and adapter schema version.
   * @param parse Runtime validator, also applied to persisted data.
   * @param loader Complete dataset loader; failures are never retained.
   * @returns Fresh validated data. Storage failures degrade to memory retention.
   */
  load<T>(
    identity: readonly string[],
    parse: (value: unknown) => T,
    loader: () => Promise<T>,
  ): Promise<T> {
    const key = `https://hype.invalid/third-party/${encodeURIComponent(JSON.stringify(identity))}`
    const existing = this.pending.get(key)
    if (existing) return existing as Promise<T>
    const pending = (async () => {
      let entry = this.entries.get(key)
      if (!entry) {
        try {
          const stored = (await this.persistence.read(key)) as Entry | undefined
          if (
            stored &&
            Number.isFinite(stored.expiresAt) &&
            stored.expiresAt <= this.now() + SOURCE_TTL_MS
          )
            entry = stored
        } catch {
          /* Persistence is optional, including private browsing. */
        }
      }
      if (entry && entry.expiresAt > this.now()) {
        try {
          const value = parse(entry.value)
          this.entries.set(key, { ...entry, value })
          return value
        } catch {
          /* Invalid or obsolete persisted schemas are refreshed. */
        }
      }
      const value = parse(await loader())
      const fresh = { expiresAt: this.now() + SOURCE_TTL_MS, value }
      this.entries.set(key, fresh)
      try {
        await this.persistence.write(key, fresh)
      } catch {
        /* Quota failures retain memory data. */
      }
      return value
    })().finally(() => {
      this.pending.delete(key)
    })
    this.pending.set(key, pending)
    return pending
  }
}
export const sourceCache = new SourceCache()
