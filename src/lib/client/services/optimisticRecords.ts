// TYPES
import type { ResourceOptimisticInput } from '#lib/context/featureQuery.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// - Record projections: record, projectResourcePatch
// - Mutation settlement: OptimisticRecords

/**
 * Narrows JSON resource objects without traversing arbitrary metadata.
 * @param value Candidate resource value.
 * @returns Whether the value is a non-array object.
 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Projects a resource patch into its known identity and image relation shapes.
 * @param value Existing record, image envelope, or collection.
 * @param type Mutated resource family.
 * @param input Identity and changed fields; absent relations are never invented.
 * @param ownerType Family owning the outer record.
 * @returns An immutable projection, preserving unchanged object identities.
 */
export function projectResourcePatch<T>(
  value: T,
  type: string,
  input: ResourceOptimisticInput,
  ownerType: string,
): T {
  if (!input.meta?.id) return value
  if (Array.isArray(value)) {
    const next = value.map(row => projectResourcePatch(row, type, input, ownerType))
    return (next.some((row, index) => row !== value[index]) ? next : value) as T
  }
  if (!record(value)) return value
  let next = value
  if (ownerType === type && value.id === input.meta.id)
    next = { ...value, ...input.data, id: value.id }
  // Images can be flat compact payloads or nested context envelopes.
  if (type === 'image') {
    for (const key of ['image', 'images'] as const) {
      if (!(key in value)) continue
      const projected = projectResourcePatch(value[key], type, input, 'image')
      if (projected !== value[key]) next = { ...next, [key]: projected }
    }
  }
  return next as T
}

type Patch = (value: unknown) => unknown
type Operation = { patch: Patch; status: 'pending' | 'committed' | 'failed' }
type Entry = { base: unknown; projected: unknown; operations: Operation[] }

/** Ordered optimistic layers prevent older failures from rolling back newer edits. */
export class OptimisticRecords {
  private entries = new Map<Map<string, unknown>, Map<string, Entry>>()

  /**
   * Applies one mutation to retained records and returns its settlement callback.
   * @param stores Existing session-owned identity stores.
   * @param patch Immutable projection for each store's resource family.
   * @returns Callback that commits or rolls back only this operation.
   */
  begin(
    stores: Array<[string, Map<string, unknown>]>,
    patch: (value: unknown, type: string) => unknown,
  ): (success: boolean) => void {
    const affected: Array<{
      store: Map<string, unknown>
      key: string
      entry: Entry
      operation: Operation
    }> = []
    for (const [type, store] of stores) {
      for (const [key, value] of store) {
        const projected = patch(value, type)
        if (projected === value) continue
        let entries = this.entries.get(store)
        if (!entries) {
          entries = new Map()
          this.entries.set(store, entries)
        }
        let entry = entries.get(key)
        if (!entry) {
          entry = { base: value, projected: value, operations: [] }
          entries.set(key, entry)
        }
        if (entry.projected !== value) entry.base = value
        const operation: Operation = {
          patch: value => patch(value, type),
          status: 'pending',
        }
        entry.operations.push(operation)
        entry.projected = projected
        store.set(key, projected)
        affected.push({ store, key, entry, operation })
      }
    }
    let settled = false
    return success => {
      if (settled) return
      settled = true
      for (const { store, key, entry, operation } of affected) {
        if (this.entries.get(store)?.get(key) !== entry) continue
        operation.status = success ? 'committed' : 'failed'
        // A newer authoritative write is the new base, never an old rollback snapshot.
        if (store.get(key) !== entry.projected) entry.base = store.get(key)
        while (entry.operations[0] && entry.operations[0].status !== 'pending') {
          const first = entry.operations.shift()
          if (first?.status === 'committed') entry.base = first.patch(entry.base)
        }
        entry.projected = entry.operations.reduce(
          (value, layer) => (layer.status === 'failed' ? value : layer.patch(value)),
          entry.base,
        )
        if (store.has(key)) store.set(key, entry.projected)
        if (!entry.operations.length) this.entries.get(store)?.delete(key)
      }
    }
  }

  /** Drops pending layers before a session/authorization transition. @returns Nothing. */
  clear(): void {
    this.entries.clear()
  }
}
