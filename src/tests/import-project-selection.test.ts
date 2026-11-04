// TESTS
import { expect, it, vi } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// SERVICES
import { handleProjectSelection } from '#lib/client/services/import/features.js'

it.each(['reset', 'new-selection', 'remap'])(
  'ignores pending project metadata after %s',
  async scenario => {
    const ctx = new ImportCtx()
    ctx.setData([['Original']])
    ctx.setHeaders(['title'])
    let finish!: () => void
    const load = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const selected = vi.fn()
    const app = { getResourceByIdSync: () => undefined }
    const pending = handleProjectSelection(
      { id: 'old', organisationId: 'org' } as never,
      ctx,
      app as never,
      load,
      selected,
    )
    if (scenario === 'reset') ctx.reset()
    else if (scenario === 'new-selection') {
      await handleProjectSelection(
        { id: 'new', organisationId: 'org' } as never,
        ctx,
        app as never,
        async () => {},
        selected,
      )
    } else ctx.setColumns([{ header: 'title', modelType: 'SKIP' }] as never)
    ctx.setCurrentStep('user-matching')
    const columns = ctx.getColumns()
    selected.mockClear()
    finish()
    await pending
    expect(ctx.getColumns()).toBe(columns)
    expect(ctx.getCurrentStep()).toBe('user-matching')
    expect(selected).not.toHaveBeenCalled()
  },
)

it('maps columns and advances a current project selection', async () => {
  const ctx = new ImportCtx()
  ctx.setData([['Title']])
  ctx.setHeaders(['title'])
  const selected = vi.fn()
  await handleProjectSelection(
    { id: 'project', organisationId: 'org' } as never,
    ctx,
    { getResourceByIdSync: () => undefined } as never,
    async () => {},
    selected,
  )
  expect(ctx.getColumns()).toHaveLength(1)
  expect(ctx.getColumns()[0].header).toBe('title')
  expect(ctx.getCurrentStep()).toBe('column-mapping')
  expect(selected).toHaveBeenCalledExactlyOnceWith(true)
})
