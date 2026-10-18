// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// TYPES
import type { Id } from '#lib/types.js'
import type { UserFeature } from '#lib/db/zod/schema/user.types.js'

type MembershipState = { wishlisted: UserFeature[]; visited: UserFeature[] }

/** Account-owned membership facts shared by surfaces; resource rows remain in ResourceClient. */
export class UserFeatureCollections {
  state: MembershipState = $state({ wishlisted: [], visited: [] })
  private overrides = new SvelteMap<
    Id,
    { row: UserFeature | null; updatedAt: number }
  >()
  private listeners = new Set<() => void>()
  private generation = 0

  /** @param listener Surface projection to reconcile after edits. @returns Cleanup function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** @returns A generation token shared by every surface fetching account membership. */
  beginRefresh(): number {
    return ++this.generation
  }

  /** @param featureId Feature to inspect. @returns Whether a recent edit supersedes remote reads. */
  hasRecentOverride(featureId: Id): boolean {
    const override = this.overrides.get(featureId)
    return Boolean(override && Date.now() - override.updatedAt < 60_000)
  }

  /** @param featureId Feature being read. @param listId Built-in list. @returns Known membership, otherwise undefined. */
  membership(featureId: Id, listId: 'wishlist' | 'visited'): boolean | undefined {
    if (this.hasRecentOverride(featureId)) {
      const row = this.overrides.get(featureId)?.row
      return Boolean(listId === 'wishlist' ? row?.isWishlisted : row?.isVisited)
    }
    const entries = listId === 'wishlist' ? this.state.wishlisted : this.state.visited
    return entries.some(row => row.featureId === featureId) || undefined
  }

  /** @param featureId Edited feature. @param updated Optimistic or confirmed row; null removes membership. @returns Nothing. */
  apply(featureId: Id, updated: UserFeature | null): void {
    this.overrides.set(featureId, { row: updated, updatedAt: Date.now() })
    const known = this.knownRows()
    known.delete(featureId)
    if (updated) known.set(featureId, updated)
    this.publish([...known.values()])
  }

  /** @param rows Full account membership response. @param generation Token captured before loading. @returns Whether applied. */
  replace(rows: UserFeature[], generation: number): boolean {
    if (generation !== this.generation) return false
    const known = new Map(rows.map(row => [row.featureId, row]))
    this.applyOverrides(known)
    this.publish([...known.values()])
    return true
  }

  /** @param featureIds Rows covered by a page. @param rows Membership facts attached to that page. @returns Nothing. */
  mergePage(featureIds: Id[], rows: UserFeature[]): void {
    const known = this.knownRows()
    for (const id of featureIds) if (!this.hasRecentOverride(id)) known.delete(id)
    for (const row of rows)
      if (!this.hasRecentOverride(row.featureId)) known.set(row.featureId, row)
    this.publish([...known.values()])
  }

  /** Invalidates pending reads and clears all membership on an account transition. @returns Nothing. */
  reset(): void {
    this.generation++
    this.overrides.clear()
    this.state = { wishlisted: [], visited: [] }
  }

  /** @returns Deduplicated current membership facts. */
  private knownRows(): Map<Id, UserFeature> {
    return new Map(
      [...this.state.wishlisted, ...this.state.visited].map(row => [
        row.featureId,
        row,
      ]),
    )
  }

  /** @param known Remote membership to reconcile with recent explicit edits. @returns Nothing. */
  private applyOverrides(known: Map<Id, UserFeature>): void {
    for (const [id, override] of this.overrides) {
      if (!this.hasRecentOverride(id)) continue
      if (override.row) known.set(id, override.row)
      else known.delete(id)
    }
  }

  /** @param rows Reconciled memberships. @returns Nothing after updating surface projections. */
  private publish(rows: UserFeature[]): void {
    this.state = {
      wishlisted: rows.filter(row => row.isWishlisted),
      visited: rows.filter(row => row.isVisited),
    }
    for (const listener of this.listeners) listener()
  }
}
