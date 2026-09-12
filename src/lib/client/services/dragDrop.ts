// TYPES
import type { DragDropState } from '@thisux/sveltednd'

/**
 * Resolve a same-list drop to the item's final index after removal.
 * @param state - The library's current drag state, including the indicated edge.
 * @param ids - Current item IDs in display order.
 * @param targetId - The item receiving the drop.
 * @param group - The unique list instance allowed to receive this drag.
 * @returns The final index, or null for foreign, stale, or unchanged drops.
 */
export function getDropIndex(
  state: DragDropState,
  ids: readonly string[],
  targetId: string,
  group: string,
): number | null {
  if (state.sourceContainerGroup !== group || !state.dropPosition) return null
  const item = state.draggedItem
  if (!item || typeof item !== 'object' || !('id' in item)) return null
  if (typeof item.id !== 'string') return null
  const from = ids.indexOf(item.id)
  const target = ids.indexOf(targetId)
  if (from < 0 || target < 0 || from === target) return null

  // Convert the indicated insertion edge to an index in the shortened list.
  const insertion = target + (state.dropPosition === 'after' ? 1 : 0)
  const destination = insertion - (from < insertion ? 1 : 0)
  return destination === from ? null : destination
}
