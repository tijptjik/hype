// TYPES
import type { ImageIntentDefinition } from './intents.js'

export type ImageIntentOptions = {
  intents: ImageIntentDefinition[]
  autoPublishUnclassified: boolean
}

/** Session-owned policy cache; authorization and mutation validation remain server-side. */
export class ImageIntentOptionsCache {
  private readonly entries = new Map<string, Promise<ImageIntentOptions>>()

  /**
   * Shares both pending and completed policy reads within one access scope.
   * @param key Access scope and persisted policy owner.
   * @param load Authorized policy loader.
   * @returns Cached policy; failed loads are evicted so a later visit can retry.
   */
  get(
    key: string,
    load: () => Promise<ImageIntentOptions>,
  ): Promise<ImageIntentOptions> {
    const cached = this.entries.get(key)
    if (cached) return cached
    const pending = Promise.resolve()
      .then(load)
      .catch(error => {
        if (this.entries.get(key) === pending) this.entries.delete(key)
        throw error
      })
    // Bound retained project catalogues without evicting a newer retry on late failure.
    if (this.entries.size >= 100) this.entries.delete(this.entries.keys().next().value!)
    this.entries.set(key, pending)
    return pending
  }

  /** Invalidates policies after owner changes or an account transition. @returns Nothing. */
  clear(): void {
    this.entries.clear()
  }
}
