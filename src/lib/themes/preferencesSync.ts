// TYPES
import type { ThemeModel } from './theme.svelte'
import type { ThemePreferences } from './preferences'

type ThemePreferenceTransport = {
  read: () => Promise<ThemePreferences | null>
  write: (preferences: ThemePreferences) => Promise<unknown>
  publish: (preferences: ThemePreferences) => void
  onError: (error: unknown) => void
}

/** One account lifetime's hydration and serialized appearance writes. */
export class ThemePreferenceSync {
  private disposed = false
  private ready = false
  private edited = false
  private saving = false
  private pending: ThemePreferences | null = null

  /**
   * Connects explicit appearance changes for one account lifetime.
   * @param model - Root-owned appearance state.
   * @param transport - Account-scoped persistence and profile callbacks.
   */
  constructor(
    private readonly model: ThemeModel,
    private readonly transport: ThemePreferenceTransport,
  ) {
    model.onPreferencesChange = this.changed
  }

  /** Loads account settings before migrating local choices. @returns Nothing after reconciliation. */
  async restore(): Promise<void> {
    try {
      const saved = await this.transport.read()
      if (this.disposed) return
      // A deliberate choice made while loading wins over the older server snapshot.
      if (saved && !this.edited) this.model.applyPreferences(saved)
      this.transport.publish(this.model.preferences)
      if (!saved || this.edited) this.pending = this.model.preferences
    } catch (error) {
      if (this.disposed) return
      // A failed read must never migrate a browser cache over unknown account settings.
      this.transport.onError(error)
    }
    this.ready = true
    await this.flush()
  }

  /** Detaches this account and rejects late reads/responses. @returns Nothing. */
  dispose(): void {
    this.disposed = true
    this.pending = null
    if (this.model.onPreferencesChange === this.changed) {
      this.model.onPreferencesChange = null
    }
  }

  /** Queues the latest explicit selection. @param preferences User choices. @returns Nothing. */
  private changed = (preferences: ThemePreferences): void => {
    if (this.disposed) return
    this.edited = true
    this.pending = preferences
    this.transport.publish(preferences)
    void this.flush()
  }

  /** Serializes writes so fast changes cannot persist out of order. @returns Nothing after queued writes settle. */
  private async flush(): Promise<void> {
    if (!this.ready || this.saving || this.disposed) return
    this.saving = true
    try {
      while (this.pending && !this.disposed) {
        const preferences = this.pending
        this.pending = null
        try {
          await this.transport.write(preferences)
        } catch (error) {
          if (!this.disposed) this.transport.onError(error)
        }
      }
    } finally {
      this.saving = false
    }
  }
}
