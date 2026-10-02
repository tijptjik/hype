import { describe, expect, it } from 'vitest'
import type { DragDropState } from '@thisux/sveltednd'
import { getDropIndex } from '#lib/client/services/dragDrop.js'

const ids = ['a', 'b', 'c', 'd']
const state: DragDropState<{ id: string }> = {
  isDragging: true,
  draggedItem: { id: 'a' },
  sourceContainer: 'list-a',
  sourceContainerGroup: 'list',
  targetContainer: 'list-c',
  targetElement: null,
  dropPosition: 'before',
}

describe('drop insertion index', () => {
  it.each([
    ['a', 'c', 'before', 1],
    ['a', 'c', 'after', 2],
    ['d', 'b', 'before', 1],
    ['d', 'b', 'after', 2],
    ['a', 'd', 'after', 3],
    ['d', 'a', 'before', 0],
    ['a', 'b', 'before', null],
    ['b', 'a', 'after', null],
    ['b', 'b', 'after', null],
  ] as const)('%s onto %s %s resolves to %s', (id, target, dropPosition, expected) => {
    expect(
      getDropIndex(
        { ...state, draggedItem: { id }, dropPosition },
        ids,
        target,
        'list',
      ),
    ).toBe(expected)
  })

  it('rejects foreign lists even when their item IDs overlap', () => {
    expect(getDropIndex(state, ids, 'c', 'other-list')).toBeNull()
  })

  it('rejects stale items, missing positions and malformed payloads', () => {
    expect(getDropIndex(state, ['b', 'c'], 'c', 'list')).toBeNull()
    expect(getDropIndex(state, ids, 'missing', 'list')).toBeNull()
    expect(getDropIndex({ ...state, dropPosition: null }, ids, 'c', 'list')).toBeNull()
    expect(getDropIndex({ ...state, draggedItem: null }, ids, 'c', 'list')).toBeNull()
  })
})
