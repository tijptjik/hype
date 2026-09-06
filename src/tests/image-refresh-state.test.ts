import { describe, expect, it, vi } from 'vitest'
import { ImageCtx } from '$lib/context/image.svelte'
import { deleteImage } from '$lib/api/server/image.remote'

vi.mock('$lib/context/app.svelte', () => ({ getAppCtx: () => ({}) }))
vi.mock('$lib/api/server/image.remote', async importOriginal => ({
  ...(await importOriginal<typeof import('$lib/api/server/image.remote')>()),
  deleteImage: vi.fn(),
}))

describe('image refresh ownership', () => {
  it('does not restore a failed deletion into a different context', async () => {
    const ctx = new ImageCtx()
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
    let reject!: (error: Error) => void
    vi.mocked(deleteImage).mockReturnValue(
      new Promise((_resolve, rej) => {
        reject = rej
      }) as ReturnType<typeof deleteImage>,
    )
    const pending = ctx.delete('old-image', { ctxType: 'feature', ctxId: 'old' })
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'new' } })
    const restore = vi.spyOn(ctx, 'setImages')
    const reset = vi.spyOn(ctx, 'resetThumbnailLoadStatus')
    reject(new Error('Delete failed'))
    await pending
    expect(restore).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })

  it('does not reset the current selection when an older context finishes late', async () => {
    const ctx = new ImageCtx()
    // Let constructor initialization finish before simulating two context changes.
    await Promise.resolve()
    let resolve!: () => void
    vi.spyOn(ctx, 'setImages')
      .mockReturnValueOnce(
        new Promise<void>(res => {
          resolve = res
        }),
      )
      .mockResolvedValue(undefined)
    const older = ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'new' } })
    const reset = vi.spyOn(ctx, 'resetActiveImage')
    resolve()
    await older
    expect(reset).not.toHaveBeenCalled()
  })

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
