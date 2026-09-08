// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ImageCtx } from '$lib/context/image.svelte'
import {
  deleteImage,
  setImagePublished,
  setImageIntent,
  rotateImage,
} from '$lib/api/server/image.remote'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

vi.mock('$lib/context/app.svelte', () => ({
  getAppCtx: () => ({ cache: { feature: new Map() } }),
}))
vi.mock('$lib/api/server/image.remote', async importOriginal => ({
  ...(await importOriginal<typeof import('$lib/api/server/image.remote')>()),
  deleteImage: vi.fn(),
  setImagePublished: vi.fn(),
  setImageIntent: vi.fn(),
  rotateImage: vi.fn(),
}))

describe('image refresh ownership', () => {
  it('submits canonical replacement without first clearing the existing canonical image', async () => {
    const ctx = new ImageCtx()
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'feature' } })
    vi.spyOn(ctx, 'getImages').mockReturnValue([
      { image: { id: 'old' }, intent: 'canonical' } as ImageCtxEnvelope,
    ])
    vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
    vi.mocked(setImageIntent)
      .mockClear()
      .mockResolvedValue({} as never)
    await ctx.handleSetIntent('new', 'canonical')
    expect(setImageIntent).toHaveBeenCalledOnce()
    expect(setImageIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new',
        intent: 'canonical',
        featureId: 'feature',
      }),
    )
  })

  it('skips image entries with missing image records or unusable IDs', async () => {
    const ctx = new ImageCtx()
    await Promise.resolve()
    const malformed = [
      null,
      undefined,
      {},
      { image: null },
      { image: {} },
      { image: { id: '' } },
      { image: { id: 42 } },
    ]
    await expect(
      ctx.setImages(malformed as unknown as ImageCtxEnvelope[]),
    ).resolves.toBeUndefined()
    expect(ctx.getImages()).toEqual([])
  })

  it.each(['rotate', 'intent'] as const)(
    'invalidates the original feature after %s without refreshing a new context',
    async action => {
      const ctx = new ImageCtx()
      await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
      ctx.appCtx.cache.feature.set('old', { id: 'old', images: [] } as never)
      ctx.appCtx.cache.feature.set('new', { id: 'new', images: [] } as never)
      let resolve!: () => void
      const pendingRemote = new Promise<void>(res => {
        resolve = res
      })
      vi.mocked(rotateImage).mockReturnValue(
        pendingRemote as ReturnType<typeof rotateImage>,
      )
      vi.mocked(setImageIntent).mockReturnValue(
        pendingRemote as ReturnType<typeof setImageIntent>,
      )
      const refresh = vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
      const pending =
        action === 'rotate'
          ? ctx.handleRotate(90, 'old-image')
          : ctx.handleSetIntent('old-image', 'general')
      await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'new' } })
      const update = vi.spyOn(ctx, 'setForImage')
      resolve()
      await pending
      expect(refresh).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(ctx.appCtx.cache.feature.get('old')?.images).toBeUndefined()
      expect(ctx.appCtx.cache.feature.get('new')?.images).toEqual([])
    },
  )

  it.each([false, true])(
    'keeps a publish response scoped when context changes: %s',
    async changeContext => {
      const ctx = new ImageCtx()
      await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
      ctx.state.activeImage = {
        image: { id: 'original' },
        isPublished: false,
      } as ImageCtxEnvelope
      let resolve!: (value: unknown) => void
      vi.mocked(setImagePublished).mockReturnValue(
        new Promise(res => {
          resolve = res
        }) as ReturnType<typeof setImagePublished>,
      )
      const refresh = vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
      const setImage = vi.spyOn(ctx, 'setForImage').mockImplementation(() => {})
      const toggle = vi.spyOn(ctx, 'toggleForActiveImage')
      const pending = ctx.handlePublishToggle()
      if (changeContext) {
        await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'new' } })
      }
      ctx.state.activeImage = {
        image: { id: 'next' },
        isPublished: false,
      } as ImageCtxEnvelope
      resolve({ data: { image: { id: 'original' } } })
      await pending
      expect(toggle).not.toHaveBeenCalled()
      if (changeContext) {
        expect(setImage).not.toHaveBeenCalled()
        expect(refresh).not.toHaveBeenCalled()
      } else {
        expect(setImage).toHaveBeenCalledWith('original', 'isPublished', true)
        expect(refresh).toHaveBeenCalledWith()
      }
      expect(ctx.state.activeImage.image.id).toBe('next')
      expect(ctx.state.activeImage.isPublished).toBe(false)
    },
  )

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
