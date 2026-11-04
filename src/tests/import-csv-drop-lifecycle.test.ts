// TESTS
import { expect, it } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// SERVICES
import { handleCSVDropEvent } from '#lib/client/services/import/features.js'

it.each(['reset', 'new-file'])(
  'ignores a CSV read completed after %s',
  async scenario => {
    const ctx = new ImportCtx()
    let finish!: (text: string) => void
    const oldFile = {
      name: 'old.csv',
      text: () =>
        new Promise<string>(resolve => {
          finish = resolve
        }),
    } as File
    const pending = handleCSVDropEvent(ctx, {
      acceptedFiles: [oldFile],
      type: 'features',
    })
    if (scenario === 'reset') ctx.reset()
    else {
      const newFile = { name: 'new.csv', text: async () => 'title\nNew' } as File
      await handleCSVDropEvent(ctx, { acceptedFiles: [newFile], type: 'features' })
    }
    const data = ctx.getData()
    const file = ctx.getFile()
    finish('title\nOld')
    await pending
    expect(ctx.getData()).toBe(data)
    expect(ctx.getFile()).toBe(file)
    if (scenario === 'reset') expect(ctx.state.isTypeSelected).toBe(false)
    else expect(ctx.getData()).toEqual([['New']])
  },
)
