// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ImageCtx } from '#lib/context/image.svelte.js'
import {
  deleteImage,
  setImagePublished,
  setImageIntent,
  rotateImage,
  updateImage,
  getImagesForContext,
} from '#lib/api/image.remote.js'
import { ImageContextResource } from '#lib/enums.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { resourceProviders } from '#lib/resources/providers.js'

function createImageResources() {
  const cacheCtx = new CacheCtx(resourceProviders)
  return {
    cache: cacheCtx.entities,
    resources: new ResourceClient(cacheCtx, () => 'test'),
    getTaskById: vi.fn(),
    invalidateResourceTargeted: vi.fn(),
    isAdmin: () => true,
  }
}
vi.mock('#lib/api/image.remote.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/api/image.remote.js')>()),
  deleteImage: vi.fn(),
  setImagePublished: vi.fn(),
  setImageIntent: vi.fn(),
  rotateImage: vi.fn(),
  updateImage: vi.fn(),
  getImagesForContext: vi.fn(() => ({ withOverride: vi.fn(() => () => {}) })),
}))

describe('image refresh ownership', () => {
  it.each([false, true])(
    'projects image metadata before persistence and rolls back failures (fail=%s)',
    async fail => {
      const ctx = new ImageCtx({}, createImageResources())
      vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
      await ctx.setContext({
        context: { ctxType: ImageContextResource.organisation, ctxId: 'org' },
      })
      const image = {
        image: { id: 'image', presentationMode: 'contain', version: 1 },
      } as ImageCtxEnvelope
      await ctx.setImages([image])
      ctx.setActiveImage(image)
      ctx.appCtx.cache.organisation.set('org', { id: 'org', image } as never)
      vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
      let resolve!: () => void
      let reject!: (error: Error) => void
      const remote = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      vi.mocked(updateImage).mockReturnValue(
        Object.assign(remote, { updates: () => remote }) as never,
      )
      const pending = ctx.updateMetadata('image', { presentationMode: 'cover' })
      expect(getImagesForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          ctxType: ImageContextResource.organisation,
          ctxId: 'org',
        }),
      )
      expect(ctx.activeImage?.image.presentationMode).toBe('cover')
      expect(ctx.appCtx.cache.organisation.get('org')).toMatchObject({
        image: { image: { presentationMode: 'cover' } },
      })
      if (fail) {
        reject(new Error('denied'))
        await expect(pending).rejects.toThrow('denied')
      } else {
        resolve()
        await pending
      }
      expect(ctx.activeImage?.image.presentationMode).toBe(fail ? 'contain' : 'cover')
      expect(ctx.appCtx.cache.organisation.get('org')).toMatchObject({
        image: { image: { presentationMode: fail ? 'contain' : 'cover' } },
      })
    },
  )

  it('does not replace the active image after navigation while metadata is saving', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
    })
    const image = {
      image: { id: 'image', presentationMode: 'contain' },
    } as ImageCtxEnvelope
    await ctx.setImages([image])
    ctx.setActiveImage(image)
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    let resolve!: () => void
    const remote = new Promise<void>(res => {
      resolve = res
    })
    vi.mocked(updateImage).mockReturnValue(
      Object.assign(remote, { updates: () => remote }) as never,
    )
    const pending = ctx.updateMetadata('image', { presentationMode: 'cover' })
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
    })
    const next = {
      image: { id: 'next', presentationMode: 'contain' },
    } as ImageCtxEnvelope
    await ctx.setImages([next])
    ctx.setActiveImage(next)
    resolve()
    await pending
    expect(ctx.activeImage?.image.id).toBe('next')
    expect(ctx.activeImage?.image.presentationMode).toBe('contain')
  })
  it('submits canonical replacement without first clearing the existing canonical image', async () => {
    const ctx = new ImageCtx({}, createImageResources())
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
    const ctx = new ImageCtx({}, createImageResources())
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
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
      ctx.appCtx.cache.feature.set('old', { id: 'old', images: [] } as never)
      ctx.appCtx.cache.feature.set('new', { id: 'new', images: [] } as never)
      let resolve!: () => void
      const pendingRemote = new Promise<void>(res => {
        resolve = res
      })
      vi.mocked(rotateImage).mockReturnValue(
        pendingRemote as unknown as ReturnType<typeof rotateImage>,
      )
      vi.mocked(setImageIntent).mockReturnValue(
        pendingRemote as unknown as ReturnType<typeof setImageIntent>,
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
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'old' } })
      ctx.state.activeImage = {
        image: { id: 'original' },
        isPublished: false,
      } as ImageCtxEnvelope
      let resolve!: (value: unknown) => void
      vi.mocked(setImagePublished).mockReturnValue(
        new Promise<unknown>(res => {
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
    const ctx = new ImageCtx({}, createImageResources())
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
    const ctx = new ImageCtx({}, createImageResources())
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
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({ context: { ctxType: 'feature', ctxId: 'feature' } })
    vi.spyOn(ctx, 'imagesQueryFn').mockRejectedValue(new Error('Read failed'))

    await expect(ctx.refreshImages()).rejects.toThrow('Read failed')
    expect(ctx.state.isFetchingImages).toBe(false)
  })

  it('ignores an older response without clearing the newer request loading state', async () => {
    const ctx = new ImageCtx({}, createImageResources())
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
    const ctx = new ImageCtx({}, createImageResources())
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
