/** Bounded browser cache for one signed-in operator and organisation account. */
export interface MediaCache {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown, bytes?: number): Promise<void>
  usage(): Promise<number>
  clear(): Promise<void>
}
interface Entry { id: string; scope: string; at: number; bytes: number; value: unknown }
const MAX_BYTES = 1_000_000_000
const MAX_AGE = 30 * 86_400_000

/** Open an optional offline cache; private mode/quota failures leave the live picker usable.
 * @param scope User and organisation-account identity; omitted in anonymous/test renderers.
 * @param onUsage Receives this scope's stored byte count after successful writes or clearing.
 * @returns Cache operations that degrade to misses if browser storage is unavailable.
 * @remarks Usage counts cached content and metadata, excluding browser storage overhead.
 */
export function createMediaCache(scope?: string, onUsage?: (bytes: number) => void): MediaCache {
  let database: Promise<IDBDatabase | undefined> | undefined
  let writes = Promise.resolve()
  const open = (): Promise<IDBDatabase | undefined> => {
    if (!scope || typeof indexedDB === 'undefined') return Promise.resolve(undefined)
    return database ??= new Promise(resolve => {
      const request = indexedDB.open('hype-media-catalog-v1', 3)
      request.onupgradeneeded = () => {
        const store = request.result.objectStoreNames.contains('entries')
          ? request.transaction!.objectStore('entries')
          : request.result.createObjectStore('entries', { keyPath: 'id' })
        if (!store.indexNames.contains('scope')) store.createIndex('scope', 'scope')
        if (!store.indexNames.contains('at')) store.createIndex('at', 'at')
        // Index the eviction metadata without copying cached previews into memory.
        if (store.indexNames.contains('budget')) store.deleteIndex('budget')
        store.createIndex('budget', ['at', 'bytes', 'scope'])
      }
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
      request.onerror = request.onblocked = () => resolve(undefined)
    })
  }
  return {
    async get<T>(key: string): Promise<T | undefined> {
      try {
        await writes
        const db = await open(); if (!db) return
        return await new Promise<T | undefined>(resolve => {
          const request = db.transaction('entries').objectStore('entries').get(`${scope}:${key}`)
          request.onsuccess = () => { const entry = request.result as Entry | undefined; resolve(entry && entry.at > Date.now() - MAX_AGE ? entry.value as T : undefined) }
          request.onerror = () => resolve(undefined)
        })
      } catch { return undefined }
    },
    put(key, value, bytes = new Blob([JSON.stringify(value)]).size) {
      // Serialize pruning so simultaneous previews cannot exceed the shared disk budget.
      writes = writes.then(async () => {
        const db = await open(); if (!db || !scope || bytes > 8 * 1024 * 1024) return
        await new Promise<void>(resolve => {
          const transaction = db.transaction('entries', 'readwrite'), store = transaction.objectStore('entries')
          store.put({ id: `${scope}:${key}`, scope, at: Date.now(), bytes, value } satisfies Entry)
          const entries: Array<{ id: IDBValidKey; at: number; bytes: number; scope: string }> = []
          let total = 0, used = 0
          const request = store.index('budget').openKeyCursor()
          request.onsuccess = () => {
            const cursor = request.result
            if (cursor) {
              const [at, bytes, entryScope] = cursor.key as [number, number, string]
              entries.push({ id: cursor.primaryKey, at, bytes, scope: entryScope }); total += bytes
              if (entryScope === scope) used += bytes
              cursor.continue(); return
            }
            for (const entry of entries) {
              if (entry.at > Date.now() - MAX_AGE && total <= MAX_BYTES) break
              store.delete(entry.id); total -= entry.bytes
              if (entry.scope === scope) used -= entry.bytes
            }
          }
          transaction.oncomplete = () => { onUsage?.(used); resolve() }
          transaction.onerror = transaction.onabort = () => resolve()
        })
      }).catch(() => {})
      return writes
    },
    async usage(): Promise<number> {
      try {
        await writes
        const db = await open(); if (!db) return 0
        return await new Promise<number>(resolve => {
          let used = 0
          // Read only indexed metadata so displaying usage never loads preview blobs.
          const transaction = db.transaction('entries')
          const request = transaction.objectStore('entries').index('budget').openKeyCursor()
          request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return
            const [, bytes, entryScope] = cursor.key as [number, number, string]
            if (entryScope === scope) used += bytes
            cursor.continue()
          }
          transaction.oncomplete = () => resolve(used)
          transaction.onerror = transaction.onabort = () => resolve(0)
        })
      } catch { return 0 }
    },
    async clear() {
      await writes
      try {
        const db = await open(); if (!db) return
        await new Promise<void>(resolve => {
          const transaction = db.transaction('entries', 'readwrite'), store = transaction.objectStore('entries')
          const cursor = store.index('scope').openKeyCursor(IDBKeyRange.only(scope))
          cursor.onsuccess = () => { if (cursor.result) { store.delete(cursor.result.primaryKey); cursor.result.continue() } }
          transaction.oncomplete = () => { onUsage?.(0); resolve() }
          transaction.onerror = transaction.onabort = () => resolve()
        })
      } catch { /* Clearing unavailable browser storage is already complete. */ }
    },
  }
}
