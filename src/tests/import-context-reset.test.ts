// TESTS
import { expect, it } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'

it('releases CSV rows and row enrichment when an import is cancelled or replaced', () => {
  const ctx = new ImportCtx()
  ctx.setData([['Previous import']])
  ctx.setRowEnrichedData(0, { feature: { title: 'Previous translated title' } })
  ctx.reset()
  expect(ctx.getData()).toEqual([])
  expect(ctx.getRowEnrichedData(0)).toBeUndefined()
  ctx.setData([['New import']])
  expect(ctx.getRowEnrichedData(0)).toBeUndefined()
})

it('resets an unfinished layer form and submission flags', () => {
  const ctx = new ImportCtx()
  ctx.state.layerForm = { id: 'old-layer' } as never
  ctx.state.isCreatingLayer = true
  ctx.state.isSubmittingLayer = true
  ctx.reset()
  expect(ctx.state.layerForm).toBeNull()
  expect(ctx.state.isCreatingLayer).toBe(false)
  expect(ctx.state.isSubmittingLayer).toBe(false)
})

it('restores every retained import field to its initial value', () => {
  const ctx = new ImportCtx()
  const initial = new ImportCtx()
  // Seed every field with a distinct value so future additions must participate in reset.
  for (const key of Object.keys(ctx.state)) {
    const value = Reflect.get(ctx.state, key)
    const changed =
      value instanceof Map
        ? new Map([['old', 'value']])
        : Array.isArray(value)
          ? ['old']
          : typeof value === 'boolean'
            ? !value
            : typeof value === 'string'
              ? 'old'
              : { old: true }
    Reflect.set(ctx.state, key, changed)
  }
  ctx.reset()
  expect(ctx.state).toEqual(initial.state)
})
