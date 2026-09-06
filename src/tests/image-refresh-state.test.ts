import { describe, expect, it, vi } from 'vitest'
import { ImageCtx } from '$lib/context/image.svelte'

vi.mock('$lib/context/app.svelte', () => ({ getAppCtx: () => ({}) }))

describe('image refresh ownership', () => {
  it('clears fetching state when the current request fails', async () => {
    const ctx = new ImageCtx()
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'feature' } })
    vi.spyOn(ctx, 'imagesQueryFn').mockRejectedValue(new Error('Read failed'))

    await expect(ctx.refreshImages()).rejects.toThrow('Read failed')
    expect(ctx.state.isFetchingImages).toBe(false)
  })

  it('ignores an older response without clearing the newer request loading state', async () => {
    const ctx = new ImageCtx()
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'feature' } })
    let resolveFirst!: (value: []) => void
    let resolveSecond!: (value: []) => void
    vi.spyOn(ctx, 'imagesQueryFn')
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveFirst = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveSecond = resolve
        }),
      )
    const setImages = vi.spyOn(ctx, 'setImages')
    const first = ctx.refreshImages()
    const second = ctx.refreshImages()

    resolveFirst([])
    await first
    expect(setImages).not.toHaveBeenCalled()
    expect(ctx.state.isFetchingImages).toBe(true)

    resolveSecond([])
    await second
    expect(setImages).toHaveBeenCalledOnce()
    expect(ctx.state.isFetchingImages).toBe(false)
  })

  it('invalidates pending reads when only the secondary task changes', async () => {
    const ctx = new ImageCtx()
    await ctx.setContext({
      context: {
        ctxType: 'feature',
        ctxId: 'feature',
        ctxTypeSecondary: 'task',
        ctxIdSecondary: 'old-task',
      },
    })
    let resolve!: (value: []) => void
    vi.spyOn(ctx, 'imagesQueryFn').mockReturnValue(
      new Promise(res => {
        resolve = res
      }),
    )
    const secondary = vi.spyOn(ctx, 'extendedImagesQueryFn').mockResolvedValue([])
    const pending = ctx.refreshImages()
    await ctx.setContext({
      context: {
        ctxType: 'feature',
        ctxId: 'feature',
        ctxTypeSecondary: 'task',
        ctxIdSecondary: 'new-task',
      },
    })
    const setImages = vi.spyOn(ctx, 'setImages')
    resolve([])
    await pending

    expect(secondary).not.toHaveBeenCalled()
    expect(setImages).not.toHaveBeenCalled()
  })
})
