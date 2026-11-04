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
  private pendingEdits = new SvelteMap<string, object>()

  /**
   * Claims one account's feature/list edit across all mounted cards.
   * @param featureId Feature being edited.
   * @param listId Membership being edited.
   * @returns Idempotent release, or null when an operation already owns this edit.
   * @remarks Hold until settlement even after unmount; the server operation remains active.
   */
  beginListEdit(featureId: Id, listId: 'wishlist' | 'visited'): (() => void) | null {
    const key = JSON.stringify([featureId, listId])
    if (this.pendingEdits.has(key)) return null
    const owner = {}
    this.pendingEdits.set(key, owner)
    return () => {
      if (this.pendingEdits.get(key) === owner) this.pendingEdits.delete(key)
    }
  }

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

  /** @param featureId Feature to inspect. @returns Whether a pending or recent edit supersedes remote reads. */
  hasRecentOverride(featureId: Id): boolean {
    const override = this.overrides.get(featureId)
    return Boolean(
      override &&
        (this.hasPendingEdit(featureId) || Date.now() - override.updatedAt < 60_000),
    )
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
    this.pruneExpiredOverrides()
    this.overrides.set(featureId, { row: updated, updatedAt: Date.now() })
    const known = this.knownRows()
    known.delete(featureId)
    if (updated) known.set(featureId, updated)
    this.publish([...known.values()])
  }

  /**
   * Applies one list edit without replacing concurrent changes to the other list.
   * @param featureId Edited feature.
   * @param listId Membership owned by this action.
   * @param updated Optimistic, confirmed or rollback snapshot for the owned list.
   * @returns Nothing after publishing the merged membership.
   */
  applyList(
    featureId: Id,
    listId: 'wishlist' | 'visited',
    updated: UserFeature | null,
  ): void {
    const current = this.knownRows().get(featureId)
    const isWishlisted = Boolean(
      listId === 'wishlist' ? updated?.isWishlisted : current?.isWishlisted,
    )
    const isVisited = Boolean(
      listId === 'visited' ? updated?.isVisited : current?.isVisited,
    )
    // Only visit edits own the timestamp; wishlist snapshots may predate a check-in.
    const visitedAt = listId === 'visited' ? updated?.visitedAt : current?.visitedAt
    this.apply(
      featureId,
      isWishlisted || isVisited
        ? ({
            ...current,
            ...updated,
            featureId,
            isWishlisted,
            isVisited,
            visitedAt: visitedAt ?? null,
          } as UserFeature)
        : null,
    )
  }

  /** @param rows Full account membership response. @param generation Token captured before loading. @returns Whether applied. */
  replace(rows: UserFeature[], generation: number): boolean {
    if (generation !== this.generation) return false
    this.pruneExpiredOverrides()
    const known = new Map(rows.map(row => [row.featureId, row]))
    this.applyOverrides(known)
    this.publish([...known.values()])
    return true
  }

  /** @param featureIds Rows covered by a page. @param rows Membership facts attached to that page. @returns Nothing. */
  mergePage(featureIds: Id[], rows: UserFeature[]): void {
    this.pruneExpiredOverrides()
    const known = this.knownRows()
    for (const id of featureIds) if (!this.hasRecentOverride(id)) known.delete(id)
    for (const row of rows)
      if (!this.hasRecentOverride(row.featureId)) known.set(row.featureId, row)
    this.publish([...known.values()])
  }

  /** Invalidates pending reads and clears all membership on an account transition. @returns Nothing. */
  reset(): void {
    this.generation++
    this.pendingEdits.clear()
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

  /** Reclaims expired snapshots during writes without mutating reactive getters. @returns Nothing. */
  private pruneExpiredOverrides(): void {
    const now = Date.now()
    for (const [id, override] of this.overrides) {
      if (now - override.updatedAt >= 60_000 && !this.hasPendingEdit(id))
        this.overrides.delete(id)
    }
  }

  /** @param featureId Feature whose optimistic state needs protection. @returns Whether either list has an active edit. */
  private hasPendingEdit(featureId: Id): boolean {
    return (
      this.pendingEdits.has(JSON.stringify([featureId, 'wishlist'])) ||
      this.pendingEdits.has(JSON.stringify([featureId, 'visited']))
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
