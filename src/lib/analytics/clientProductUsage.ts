// DOMAIN
import { clientUsageSchema } from './productUsage.js'
// TYPES
import type { ClientUsage } from './productUsage.js'

/**
 * Sends a bounded interaction to the same-origin collector.
 * @param input Event and resource identity, without personal data.
 * @returns Nothing.
 * @remarks Delivery is best effort; no retry can duplicate a successful delivery.
 */
export function trackClientProductUsage(input: ClientUsage): void {
  if (typeof window === 'undefined') return
  const parsed = clientUsageSchema.safeParse(input)
  if (!parsed.success) return
  try {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Optional analytics must not interrupt navigation even if fetch is unavailable.
  }
}

/** Tracks actual public map state, independent of prefetches and remote query refreshes. */
export class ProductUsageObserver {
  private hubId: string | null = null
  private featureId: string | null = null
  private layers = new Set<string>()
  private projects = new Set<string>()

  /** @param emit Best-effort event transport. */
  constructor(
    private readonly emit: (event: ClientUsage) => void = trackClientProductUsage,
  ) {}

  /**
   * Emits newly active selections, including initial defaults and deep links.
   * @param snapshot Current hub, visible feature, layers and project filters.
   * @returns Nothing; unchanged selections and reordering produce no events.
   * @remarks A close/reopen or deactivate/reactivate counts as another interaction.
   */
  sync(snapshot: {
    hubId: string
    featureId: string | null
    layers: string[]
    projects: string[]
  }): void {
    if (this.hubId !== snapshot.hubId) {
      this.hubId = snapshot.hubId
      this.featureId = null
      this.layers.clear()
      this.projects.clear()
    }
    if (snapshot.featureId && snapshot.featureId !== this.featureId)
      this.emit({ event: 'feature.view', entityId: snapshot.featureId })
    this.featureId = snapshot.featureId
    for (const id of new Set(snapshot.layers))
      if (!this.layers.has(id)) this.emit({ event: 'layer.activate', entityId: id })
    for (const id of new Set(snapshot.projects))
      if (!this.projects.has(id)) this.emit({ event: 'project.filter', entityId: id })
    this.layers = new Set(snapshot.layers)
    this.projects = new Set(snapshot.projects)
  }
}
