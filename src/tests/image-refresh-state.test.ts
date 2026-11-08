// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ImageCtx } from '#lib/context/image.svelte.js'
import { getTaskImageBadgeLabel } from '#lib/client/services/task.js'
import {
  deleteImage,
  setImagePublished,
  setImageIntent,
  rotateImage,
  updateImage,
  getImagesForContext,
  getImageIntentOptions,
} from '#lib/api/image.remote.js'
import { ImageContextResource, ImageContextResourceExtended } from '#lib/enums.js'
import type { ImageCtxEnvelope, ImageUpload } from '#lib/db/zod/schema/image.types.js'

import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import {
  FeatureQuery,
  FeatureQueryRetention,
} from '#lib/context/feature-query.svelte.js'
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
import { createPreviewableUploadFile } from '#lib/images/upload.js'
vi.mock('#lib/images/upload.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/images/upload.js')>()),
  createPreviewableUploadFile: vi.fn(),
}))

import {
  uploadAndProcessImage,
  prepareImageUpload,
  uploadPreparedImageObject,
  finalizePreparedImageUpload,
} from '#lib/client/services/image.js'
vi.mock('#lib/client/services/image.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/client/services/image.js')>()),
  uploadAndProcessImage: vi.fn(),
  prepareImageUpload: vi.fn(),
  uploadPreparedImageObject: vi.fn(),
  finalizePreparedImageUpload: vi.fn(),
}))

vi.mock('#lib/api/image.remote.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/api/image.remote.js')>()),
  getImageIntentOptions: vi
    .fn()
    .mockResolvedValue({ intents: [], autoPublishUnclassified: true }),
  deleteImage: vi.fn(),
  setImagePublished: vi.fn(),
  setImageIntent: vi.fn(),
  rotateImage: vi.fn(),
  updateImage: vi.fn(),
  getImagesForContext: vi.fn(() => ({ withOverride: vi.fn(() => () => {}) })),
}))

describe('image refresh ownership', () => {
  it('refreshes an active Feature query after rotation changes its asset identity', async () => {
    const initial = {
      data: [
        {
          id: 'feature',
          isPublished: true,
          isArchived: false,
          image: { publicId: 'old-key' },
        },
      ],
      totalCount: 1,
      nextCursor: null,
      facets: null,
    }
    const native = Object.assign(Promise.resolve(initial), {
      current: initial,
      ready: false,
      refresh: vi.fn(async () => {
        native.current = {
          ...initial,
          data: [{ ...initial.data[0], image: { publicId: 'new-key' } }],
        }
      }),
    })
    const cache = new CacheCtx({
      ...resourceProviders,
      createFeatureMechanics: () => ({
        retention: new FeatureQueryRetention(),
        create: () =>
          new FeatureQuery(
            input => {
              if (input.excludeIds?.includes('feature')) {
                const empty = { ...initial, data: [] }
                return Object.assign(Promise.resolve(empty), {
                  current: empty,
                  ready: false,
                  refresh: vi.fn(),
                }) as never
              }
              return native as never
            },
            undefined,
            undefined,
            true,
          ),
      }),
    })
    const app = {
      ...createImageResources(),
      cache: cache.entities,
      resources: new ResourceClient(cache, () => 'test'),
    }
    const features = app.resources.featureQueries.map
    await features.load({ meta: { isAdminRequest: false, scope: 'public' } })
    expect(features.rows[0]).toMatchObject({ image: { publicId: 'old-key' } })
    native.ready = true
    const ctx = new ImageCtx({}, app)
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
    vi.mocked(rotateImage).mockResolvedValue({} as never)
    await ctx.handleRotate(90, 'image')
    expect(native.refresh).toHaveBeenCalledOnce()
    expect(features.rows[0]).toMatchObject({ image: { publicId: 'new-key' } })
  })

  it.each(
    [false, true].flatMap(fail =>
      (['cover', 'cast-edges'] as const).map(mode => ({ fail, mode })),
    ),
  )(
    'projects image metadata before persistence and rolls back failures (mode=$mode, fail=$fail)',
    async ({ fail, mode }) => {
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
      const pending = ctx.updateMetadata('image', { presentationMode: mode })
      expect(getImagesForContext).toHaveBeenCalledWith(
        expect.objectContaining({
          ctxType: ImageContextResource.organisation,
          ctxId: 'org',
        }),
      )
      expect(ctx.activeImage?.image.presentationMode).toBe(mode)
      expect(ctx.appCtx.cache.organisation.get('org')).toMatchObject({
        image: { image: { presentationMode: mode } },
      })
      if (fail) {
        reject(new Error('denied'))
        await expect(pending).rejects.toThrow('denied')
      } else {
        resolve()
        await pending
      }
      expect(ctx.activeImage?.image.presentationMode).toBe(fail ? 'contain' : mode)
      expect(ctx.appCtx.cache.organisation.get('org')).toMatchObject({
        image: { image: { presentationMode: fail ? 'contain' : mode } },
      })
    },
  )

  it('advances the displayed logo pin after immediate metadata saves', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    await ctx.setContext({
      context: { ctxType: ImageContextResource.organisation, ctxId: 'org' },
    })
    const image = {
      image: { id: 'image', imageRevisionId: 'before', presentationMode: 'contain' },
    } as ImageCtxEnvelope
    const saved = {
      image: { id: 'image', imageRevisionId: 'after', presentationMode: 'cast-edges' },
    } as ImageCtxEnvelope
    await ctx.setImages([image])
    ctx.setActiveImage(image)
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
    vi.mocked(updateImage).mockResolvedValue({ data: saved } as never)
    await ctx.updateMetadata('image', { presentationMode: 'cast-edges' })
    expect(ctx.activeImage?.image.imageRevisionId).toBe('after')
    expect(ctx.getImage('image')?.image.presentationMode).toBe('cast-edges')
  })

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
  it('refreshes native feature and task queries after intent changes instead of restoring cached labels', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    await ctx.setContext({
      context: {
        ctxType: ImageContextResource.feature,
        ctxId: 'feature',
        ctxTypeSecondary: ImageContextResourceExtended.task,
        ctxIdSecondary: 'task',
      },
    })
    const submitted = {
      image: { id: 'submitted' },
      intent: 'undefined',
      isPublished: false,
    } as ImageCtxEnvelope
    const previous = {
      image: { id: 'previous' },
      intent: 'canonical',
      isPublished: true,
    } as ImageCtxEnvelope
    await ctx.setImages([submitted, previous])
    ctx.setActiveImage(submitted)
    const fresh = [
      { ...submitted, intent: 'canonical', isPublished: true },
      { ...previous, intent: 'undefined' },
    ] as ImageCtxEnvelope[]
    const refreshes = [vi.fn(), vi.fn()]
    vi.mocked(getImagesForContext).mockImplementation(params => {
      const handle = Object.assign(Promise.resolve({ data: [submitted, previous] }), {
        current: { data: [submitted, previous] },
        refresh: async () => {
          refreshes[params.ctxType === 'task' ? 1 : 0]()
          handle.current = { data: fresh }
        },
      })
      return handle as never
    })
    vi.mocked(setImageIntent).mockResolvedValue({} as never)
    try {
      await ctx.handleSetIntent('submitted', 'canonical')
      expect(refreshes[0]).toHaveBeenCalledOnce()
      expect(refreshes[1]).toHaveBeenCalledOnce()
      expect(ctx.getImage('submitted')).toMatchObject({
        intent: 'canonical',
        isPublished: true,
      })
      expect(ctx.activeImage?.intent).toBe('canonical')
      expect(ctx.getImage('previous')?.intent).toBe('undefined')
    } finally {
      vi.mocked(getImagesForContext).mockReset()
      vi.mocked(getImagesForContext).mockReturnValue({
        withOverride: vi.fn(() => () => {}),
      } as never)
      ctx.dispose()
    }
  })

  it('classifies task evidence without changing its publication state', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
    vi.mocked(setImageIntent)
      .mockClear()
      .mockResolvedValue({} as never)
    try {
      await ctx.handleSetIntent('submitted', 'context', false)
      expect(setImageIntent).toHaveBeenCalledOnce()
      const request = vi.mocked(setImageIntent).mock.calls[0][0]
      expect(request).toMatchObject({
        id: 'submitted',
        intent: 'context',
        featureId: 'feature',
      })
      expect(request).not.toHaveProperty('isPublished')
    } finally {
      ctx.dispose()
    }
  })

  it('submits canonical replacement without first clearing the existing canonical image', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
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
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
      })
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
      const reconcile = vi
        .spyOn(ctx.appCtx.resources, 'reconcile')
        .mockResolvedValue(undefined)
      const refresh = vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
      const pending =
        action === 'rotate'
          ? ctx.handleRotate(90, 'old-image')
          : ctx.handleSetIntent('old-image', 'general')
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
      })
      const update = vi.spyOn(ctx, 'setForImage')
      resolve()
      await pending
      expect(reconcile).toHaveBeenCalledWith('feature')
      expect(refresh).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
      expect(ctx.appCtx.cache.feature.get('old')).toMatchObject({ images: undefined })
      expect(ctx.appCtx.cache.feature.get('new')).toMatchObject({ images: [] })
    },
  )

  it.each([false, true])(
    'keeps a publish response scoped when context changes: %s',
    async changeContext => {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
      })
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
      const reconcile = vi
        .spyOn(ctx.appCtx.resources, 'reconcile')
        .mockResolvedValue(undefined)
      const refresh = vi.spyOn(ctx, 'refreshImages').mockResolvedValue(undefined)
      const setImage = vi.spyOn(ctx, 'setForImage').mockImplementation(() => {})
      const toggle = vi.spyOn(ctx, 'toggleForActiveImage')
      const pending = ctx.handlePublishToggle()
      if (changeContext) {
        await ctx.setContext({
          context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
        })
      }
      ctx.state.activeImage = {
        image: { id: 'next' },
        isPublished: false,
      } as ImageCtxEnvelope
      resolve({ data: { image: { id: 'original' } } })
      await pending
      expect(reconcile).toHaveBeenCalledWith('feature')
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

  it('assigns distinct queue identities to the same file selected within one clock tick', async () => {
    const OriginalURL = URL
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL = vi.fn(() => 'blob:preview')
        static revokeObjectURL = vi.fn()
      },
    )
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
      })
      const file = new File(['abc'], 'image.jpg')
      vi.mocked(createPreviewableUploadFile).mockResolvedValue(file)
      await ctx.addToUploadQueue([file])
      await ctx.addToUploadQueue([file])
      expect(
        new Set(ctx.state.uploadQueue.map(upload => upload.optimisticKey)).size,
      ).toBe(2)
    } finally {
      now.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it.each(['status', 'retry', 'error'] as const)(
    'isolates %s updates for queue entries sharing a File',
    async operation => {
      const ctx = new ImageCtx({}, createImageResources())
      const file = new File(['abc'], 'same.jpg')
      const entries: ImageUpload[] = ['first', 'second'].map(optimisticKey => ({
        file,
        optimisticKey,
        status: 'uploading',
        retries: 0,
        queuedAt: 1000,
      }))
      ctx.state.uploadQueue = entries
      if (operation === 'status') ctx.setUploadStatus(entries[1], 'finalizing')
      if (operation === 'retry') ctx.setUploadToRetry(entries[1])
      if (operation === 'error') ctx['setUploadError'](entries[1], 'Failed')
      expect(ctx.state.uploadQueue[0]).toMatchObject({
        status: 'uploading',
        retries: 0,
      })
      expect(ctx.state.uploadQueue[0].errorMessage).toBeUndefined()
      expect(ctx.state.uploadQueue[1]).toMatchObject(
        operation === 'status'
          ? { status: 'finalizing' }
          : operation === 'retry'
            ? { status: 'uploading', retries: 1 }
            : { status: 'error', errorMessage: 'Failed' },
      )
    },
  )

  it.each([false, true])(
    'suppresses retry clicks while active and releases ownership after failure=%s',
    async fail => {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
      })
      vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
      let resolve!: (image: ImageCtxEnvelope) => void
      let reject!: (error: Error) => void
      vi.mocked(uploadAndProcessImage)
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((res, rej) => {
              resolve = res
              reject = rej
            }),
        )
        .mockResolvedValue({ image: { id: 'saved' } } as ImageCtxEnvelope)
      const fileObject: ImageUpload = {
        file: new File(['abc'], 'image.jpg'),
        status: 'uploading',
        retries: 0,
        queuedAt: 1000,
        optimisticKey: 'one',
      }
      const pending = ctx.upload({ fileObject })
      ctx.retryUpload(fileObject)
      ctx.retryUpload(fileObject)
      expect(uploadAndProcessImage).toHaveBeenCalledTimes(1)
      if (fail) {
        reject(new Error('Upload failed'))
        await expect(pending).rejects.toThrow('Upload failed')
      } else {
        resolve({ image: { id: 'saved' } } as ImageCtxEnvelope)
        await pending
      }
      await ctx.upload({ fileObject })
      expect(uploadAndProcessImage).toHaveBeenCalledTimes(2)
    },
  )

  it('replays a batch upload confirmation when the user retries a lost acknowledgment', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    const entry: ImageUpload = {
      file: new File(['abc'], 'image.jpg'),
      optimisticKey: 'retained',
      status: 'uploading',
      retries: 0,
      queuedAt: 1000,
    }
    ctx.state.uploadQueue = [entry]
    const prepared = { auth: { confirmToken: 'same-token' } } as never
    vi.mocked(prepareImageUpload).mockReset().mockResolvedValue(prepared)
    vi.mocked(uploadPreparedImageObject).mockReset().mockResolvedValue(undefined)
    vi.mocked(uploadAndProcessImage)
      .mockReset()
      .mockResolvedValue({ image: { id: 'duplicate' } } as ImageCtxEnvelope)
    vi.mocked(finalizePreparedImageUpload)
      .mockReset()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ image: { id: 'saved' } } as ImageCtxEnvelope)
    await ctx['processUploadQueue']({})
    expect(ctx.state.uploadQueue[0].status).toBe('error')
    ctx.setUploadToRetry(entry)
    await ctx.upload({ fileObject: ctx.state.uploadQueue[0] })
    expect(uploadAndProcessImage).not.toHaveBeenCalled()
    expect(prepareImageUpload).toHaveBeenCalledOnce()
    expect(uploadPreparedImageObject).toHaveBeenCalledOnce()
    expect(
      vi.mocked(finalizePreparedImageUpload).mock.calls.map(call => call[0]),
    ).toEqual([prepared, prepared])
    expect(ctx.state.uploadQueue[0].savedImage?.image.id).toBe('saved')
  })

  it.each(['unchanged', 'scope', 'file', 'removed', 'options'] as const)(
    'retains single-upload confirmation only for compatible intent: %s',
    async change => {
      const app = createImageResources()
      let scope = 'first'
      vi.spyOn(app.resources, 'scopeKey', 'get').mockImplementation(() => scope)
      const ctx = new ImageCtx({}, app)
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
      })
      vi.spyOn(app.resources, 'reconcile').mockResolvedValue(undefined)
      const entry: ImageUpload = {
        file: new File(['abc'], 'image.jpg'),
        optimisticKey: 'retained',
        status: 'uploading',
        retries: 0,
        queuedAt: 1000,
      }
      ctx.state.uploadQueue = [entry]
      const prepared = {
        auth: { confirmToken: 'same-token', expiresAt: '2000-01-01T00:00:00Z' },
      } as never
      const options = { isPublished: false, intent: 'general' as const }
      vi.mocked(uploadAndProcessImage)
        .mockReset()
        .mockImplementationOnce(async (_file, _ctx, _extended, _fetch, hooks) => {
          hooks?.onObjectUploaded?.(prepared)
          throw new TypeError('Failed to fetch')
        })
        .mockResolvedValue({ image: { id: 'new' } } as ImageCtxEnvelope)
      vi.mocked(finalizePreparedImageUpload)
        .mockReset()
        .mockResolvedValue({ image: { id: 'retained' } } as ImageCtxEnvelope)
      await expect(
        ctx.upload({ fileObject: entry, extended: { featureImage: options } }),
      ).rejects.toThrow('Failed to fetch')
      if (change === 'scope') scope = 'second'
      if (change === 'file') entry.file = new File(['new'], 'image.jpg')
      if (change === 'removed') {
        ctx.resetUploadQueue()
        ctx.state.uploadQueue = [entry]
      }
      await ctx.upload({
        fileObject: entry,
        ...(change === 'options'
          ? { extended: { featureImage: { ...options, isPublished: true } } }
          : {}),
      })
      expect(finalizePreparedImageUpload).toHaveBeenCalledTimes(
        change === 'unchanged' ? 1 : 0,
      )
      expect(uploadAndProcessImage).toHaveBeenCalledTimes(
        change === 'unchanged' ? 1 : 2,
      )
      if (change === 'unchanged')
        expect(finalizePreparedImageUpload).toHaveBeenCalledWith(prepared)
      // Successful confirmation releases retained credentials even if the same entry is invoked again.
      await ctx.upload({ fileObject: entry })
      expect(uploadAndProcessImage).toHaveBeenCalledTimes(
        change === 'unchanged' ? 2 : 3,
      )
    },
  )

  it('keeps an expired retained confirmation from silently becoming a new upload', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    const entry: ImageUpload = {
      file: new File(['abc'], 'image.jpg'),
      optimisticKey: 'expired',
      status: 'uploading',
      retries: 0,
      queuedAt: 1000,
    }
    ctx.state.uploadQueue = [entry]
    const prepared = { auth: { confirmToken: 'expired-token' } } as never
    vi.mocked(uploadAndProcessImage)
      .mockReset()
      .mockImplementationOnce(async (_file, _ctx, _extended, _fetch, hooks) => {
        hooks?.onObjectUploaded?.(prepared)
        throw new TypeError('Failed to fetch')
      })
    const expired = Object.assign(new Error('Invalid upload token'), { status: 403 })
    vi.mocked(finalizePreparedImageUpload).mockReset().mockRejectedValue(expired)
    await expect(ctx.upload({ fileObject: entry })).rejects.toThrow('Failed to fetch')
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(ctx.upload({ fileObject: entry })).rejects.toBe(expired)
      expect(ctx.state.uploadQueue[0].status).toBe('error')
    }
    expect(uploadAndProcessImage).toHaveBeenCalledOnce()
    expect(
      vi.mocked(finalizePreparedImageUpload).mock.calls.map(call => call[0]),
    ).toEqual([prepared, prepared])
  })

  it('does not restore retained credentials when an entry is removed during its PUT', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    const entry: ImageUpload = {
      file: new File(['abc'], 'image.jpg'),
      optimisticKey: 'removed',
      status: 'uploading',
      retries: 0,
      queuedAt: 1000,
    }
    ctx.state.uploadQueue = [entry]
    const put = Promise.withResolvers<void>()
    const enteredPut = Promise.withResolvers<void>()
    const enteredFinalize = Promise.withResolvers<void>()
    const confirmation = Promise.withResolvers<ImageCtxEnvelope>()
    vi.mocked(prepareImageUpload)
      .mockReset()
      .mockResolvedValue({} as never)
    vi.mocked(uploadPreparedImageObject)
      .mockReset()
      .mockImplementationOnce(() => {
        enteredPut.resolve()
        return put.promise
      })
    vi.mocked(finalizePreparedImageUpload)
      .mockReset()
      .mockImplementationOnce(() => {
        enteredFinalize.resolve()
        return confirmation.promise
      })
    const pending = ctx['processUploadQueue']({})
    await enteredPut.promise
    ctx.removeFromUploadQueue(entry.file)
    put.resolve()
    await enteredFinalize.promise
    expect(ctx['preparedConfirmations'].size).toBe(0)
    confirmation.reject(new TypeError('Failed to fetch'))
    await pending
    expect(ctx.state.uploadQueue).toEqual([])
    expect(ctx['preparedConfirmations'].size).toBe(0)
  })

  it('does not prepare the same entry twice when file selections overlap', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    let number = 0
    vi.spyOn(ctx, 'addToUploadQueue').mockImplementation(async () => {
      const key = `upload-${++number}`
      ctx.state.uploadQueue.push({
        file: new File(['abc'], `${key}.jpg`, { type: 'image/jpeg' }),
        status: 'uploading',
        queuedAt: number,
        retries: 0,
        optimisticKey: key,
      })
    })
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    vi.spyOn(ctx, 'setActiveImage').mockImplementation(() => {})
    vi.spyOn(ctx, 'invalidateResource').mockResolvedValue(undefined)
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    let release!: (value: never) => void
    let entered!: () => void
    const started = new Promise<void>(resolve => {
      entered = resolve
    })
    vi.mocked(prepareImageUpload)
      .mockReset()
      .mockResolvedValue({} as never)
      .mockImplementationOnce(() => {
        entered()
        return new Promise(resolve => {
          release = resolve
        })
      })
    vi.mocked(uploadPreparedImageObject).mockResolvedValue(undefined)
    vi.mocked(finalizePreparedImageUpload)
      .mockReset()
      .mockResolvedValue({ image: { id: 'saved' } } as ImageCtxEnvelope)
    const first = ctx.handleFilesSelect([], [])
    await started
    await ctx.handleFilesSelect([], [])
    release({} as never)
    await first
    expect(prepareImageUpload).toHaveBeenCalledTimes(2)
    expect(finalizePreparedImageUpload).toHaveBeenCalledTimes(2)
    expect(ctx.state.uploadQueue.map(upload => upload.status)).toEqual([
      'uploaded',
      'uploaded',
    ])
  })

  it.each([
    'success',
    'success-callback',
    'prepare-callback',
    'finalize-callback',
  ] as const)(
    'preserves committed batch status when completion callbacks fail: %s',
    async scenario => {
      const failedEntry =
        scenario === 'prepare-callback' || scenario === 'finalize-callback'
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.project, ctxId: 'project' },
      })
      vi.spyOn(ctx, 'addToUploadQueue').mockImplementation(async () => {
        ctx.state.uploadQueue = ['one', 'two'].map(key => ({
          file: new File(['abc'], `${key}.jpg`, { type: 'image/jpeg' }),
          status: 'uploading',
          retries: 0,
          queuedAt: 1000,
          optimisticKey: key,
        }))
      })
      vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
      vi.spyOn(ctx, 'setActiveImage').mockImplementation(() => {})
      vi.spyOn(ctx, 'invalidateResource').mockResolvedValue(undefined)
      const reconcile = vi
        .spyOn(ctx.appCtx.resources, 'reconcile')
        .mockResolvedValue(undefined)
      vi.mocked(prepareImageUpload)
        .mockReset()
        .mockResolvedValue({} as never)
      vi.mocked(uploadPreparedImageObject).mockResolvedValue(undefined)
      let savedId = 0
      vi.mocked(finalizePreparedImageUpload)
        .mockReset()
        .mockImplementation(
          async () => ({ image: { id: `saved-${++savedId}` } }) as ImageCtxEnvelope,
        )
      if (scenario === 'prepare-callback')
        vi.mocked(prepareImageUpload).mockRejectedValueOnce(new Error('Prepare failed'))
      if (scenario === 'finalize-callback')
        vi.mocked(finalizePreparedImageUpload).mockRejectedValueOnce(
          new Error('Finalize failed'),
        )
      const success = vi.fn()
      const failed = vi.fn()
      if (scenario === 'success-callback')
        success.mockImplementationOnce(() => {
          throw new Error('Consumer callback failed')
        })
      if (failedEntry)
        failed.mockImplementationOnce(() => {
          throw new Error('Error callback failed')
        })
      const operation = ctx.handleFilesSelect([], [], {
        onSuccess: success,
        onError: failed,
      })
      if (scenario !== 'success')
        await expect(operation).rejects.toThrow(
          'Images saved, but local completion failed',
        )
      else await operation
      expect(failed).toHaveBeenCalledTimes(failedEntry ? 1 : 0)
      expect(success).toHaveBeenCalledTimes(failedEntry ? 1 : 2)
      expect(reconcile).toHaveBeenCalledExactlyOnceWith('project')
      expect(ctx.state.uploadQueue.map(upload => upload.status)).toEqual([
        failedEntry ? 'error' : 'uploaded',
        'uploaded',
      ])
    },
  )

  it.each(['upload', 'staging', 'selection', 'staged-selection'] as const)(
    'discards stale %s previews after navigation',
    async kind => {
      const revoke = vi.fn()
      const OriginalURL = URL
      vi.stubGlobal(
        'URL',
        class extends OriginalURL {
          static createObjectURL = vi.fn(() => 'blob:stale-preview')
          static revokeObjectURL = revoke
        },
      )
      try {
        const ctx = new ImageCtx({}, createImageResources())
        await ctx.setContext({
          context: { ctxType: ImageContextResource.project, ctxId: 'old' },
        })
        const file = new File(['abc'], 'old.jpg', { type: 'image/jpeg' })
        let finish!: (file: File) => void
        vi.mocked(createPreviewableUploadFile).mockReturnValueOnce(
          new Promise(resolve => {
            finish = resolve
          }),
        )
        const prepare = vi.mocked(prepareImageUpload)
        prepare.mockClear()
        const operation =
          kind === 'upload'
            ? ctx.addToUploadQueue([file])
            : kind === 'staging'
              ? ctx.addToStagingQueue([file])
              : kind === 'selection'
                ? ctx.handleFilesSelect([file], [])
                : ctx.handleStagedFilesSelect([file], [])
        await ctx.setContext({
          context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
        })
        finish(file)
        await operation
        expect(ctx.state.uploadQueue).toEqual([])
        expect(ctx.state.stagingQueue).toEqual([])
        expect(ctx.getImages()).toEqual([])
        expect(prepare).not.toHaveBeenCalled()
        expect(revoke).toHaveBeenCalledWith('blob:stale-preview')
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('does not clear another viewer staging queue when an old staged upload finishes', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
    })
    const file = new File(['abc'], 'old.jpg', { type: 'image/jpeg' })
    ctx.state.images.set('staged-old', {
      image: {
        id: 'staged-old',
        cdn: 'preview',
        file,
        createdAt: '2026-01-01T00:00:00Z',
      },
    } as ImageCtxEnvelope)
    vi.mocked(prepareImageUpload).mockResolvedValue({} as never)
    vi.mocked(uploadPreparedImageObject).mockResolvedValue(undefined)
    let finish!: (image: ImageCtxEnvelope) => void
    let entered!: () => void
    const started = new Promise<void>(resolve => {
      entered = resolve
    })
    vi.mocked(finalizePreparedImageUpload).mockImplementationOnce(() => {
      entered()
      return new Promise(resolve => {
        finish = resolve
      })
    })
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    const operation = ctx.uploadStagedImages()
    await started
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
    })
    const staged: ImageUpload = {
      file,
      optimisticKey: 'new-preview',
      status: 'staged',
      queuedAt: 1000,
      retries: 0,
    }
    ctx.state.stagingQueue = [staged]
    finish({ image: { id: 'saved-old' } } as ImageCtxEnvelope)
    await operation
    expect(ctx.state.stagingQueue).toEqual([staged])
    expect(ctx.getImages()).toEqual([])
  })

  it('keeps queued upload completion scoped after navigation', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.project, ctxId: 'old' },
    })
    let finish!: () => void
    vi.spyOn(ctx, 'addToUploadQueue').mockReturnValue(
      new Promise<void>(resolve => {
        finish = resolve
      }),
    )
    const invalidate = vi.spyOn(ctx, 'invalidateResource').mockResolvedValue(undefined)
    const select = vi.spyOn(ctx, 'setActiveImageToTargetOrFirst')
    const operation = ctx.handleFilesSelect([], [])
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
    })
    select.mockClear()
    finish()
    await operation
    expect(select).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it.each(['new-portrait', 'cleared'] as const)(
    'does not overwrite %s resource cache state after failed deletion',
    async scenario => {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.project, ctxId: 'project' },
      })
      ctx.appCtx.cache.project.set('project', {
        id: 'project',
        image: { image: { id: 'old' } },
      } as never)
      let reject!: (error: Error) => void
      vi.mocked(deleteImage)
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, rej) => {
              reject = rej
            }) as ReturnType<typeof deleteImage>,
        )
      const operation = ctx.delete('old', {
        ctxType: ImageContextResource.project,
        ctxId: 'project',
      })
      const updated = { id: 'project', image: { image: { id: 'new' } } }
      if (scenario === 'new-portrait')
        ctx.appCtx.cache.project.set('project', updated as never)
      else ctx.appCtx.cache.project.clear()
      reject(new Error('Deletion failed'))
      await operation
      expect(ctx.appCtx.cache.project.get('project')).toEqual(
        scenario === 'new-portrait' ? updated : undefined,
      )
    },
  )

  it.each([false, true])(
    'retains upload previews until deletion commits: failure=%s',
    async fail => {
      const OriginalURL = URL
      const revoke = vi.fn()
      vi.stubGlobal(
        'URL',
        class extends OriginalURL {
          static revokeObjectURL = revoke
        },
      )
      try {
        const ctx = new ImageCtx({}, createImageResources())
        vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
        await ctx.setContext({
          context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
        })
        const image = { image: { id: 'image' } } as ImageCtxEnvelope
        await ctx.setImages([image])
        const upload: ImageUpload = {
          file: new File(['abc'], 'image.jpg'),
          status: 'uploaded',
          queuedAt: 1000,
          retries: 0,
          optimisticKey: 'upload',
          savedImage: image,
          preview: 'blob:retained',
        }
        ctx.state.uploadQueue = [upload]
        vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
        if (fail)
          vi.mocked(deleteImage).mockRejectedValueOnce(new Error('Deletion failed'))
        else vi.mocked(deleteImage).mockResolvedValueOnce({} as never)
        await ctx.delete('image', {
          ctxType: ImageContextResource.feature,
          ctxId: 'feature',
        })
        if (fail) {
          expect(revoke).not.toHaveBeenCalled()
          expect(ctx.state.uploadQueue).toEqual([upload])
        } else {
          expect(revoke).toHaveBeenCalledWith('blob:retained')
          expect(ctx.state.uploadQueue).toEqual([])
        }
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('rolls back only the failed deletion while preserving other changes and selection', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    const row = (id: string) => ({ image: { id } }) as ImageCtxEnvelope
    await ctx.setImages([row('a'), row('b'), row('c')])
    ctx.setActiveImage(ctx.getImage('a')!)
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    let reject!: (error: Error) => void
    vi.mocked(deleteImage)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, rej) => {
            reject = rej
          }) as ReturnType<typeof deleteImage>,
      )
      .mockResolvedValue({} as never)
    const context = { ctxType: ImageContextResource.feature, ctxId: 'feature' }
    const pending = ctx.delete('a', context)
    await ctx.delete('b', context)
    ctx.state.images.set('d', row('d'))
    ctx.setActiveImage(ctx.getImage('d')!)
    reject(new Error('Delete failed'))
    await pending
    expect(
      ctx
        .getImages()
        .map(image => image.image.id)
        .sort(),
    ).toEqual(['a', 'c', 'd'])
    expect(ctx.state.activeImage?.image.id).toBe('d')
  })

  it('joins repeated deletions of the same image', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    vi.spyOn(ctx.appCtx.resources, 'reconcile').mockResolvedValue(undefined)
    let finish!: (value: never) => void
    vi.mocked(deleteImage)
      .mockReset()
      .mockImplementation(
        () =>
          new Promise(resolve => {
            finish = resolve
          }) as ReturnType<typeof deleteImage>,
      )
    const context = { ctxType: ImageContextResource.feature, ctxId: 'feature' }
    const first = ctx.delete('image', context)
    const second = ctx.delete('image', context)
    expect(deleteImage).toHaveBeenCalledTimes(1)
    finish({} as never)
    await Promise.all([first, second])
  })

  it.each([false, true])(
    'reconciles committed deletion without restoring it on refresh failure: %s',
    async failRefresh => {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
      })
      vi.mocked(deleteImage).mockResolvedValue({} as never)
      const reconcile = vi.spyOn(ctx.appCtx.resources, 'reconcile')
      if (failRefresh) reconcile.mockRejectedValue(new Error('Refresh failed'))
      else reconcile.mockResolvedValue(undefined)
      const restore = vi.spyOn(ctx, 'setImages')
      const operation = ctx.delete('old-image', {
        ctxType: ImageContextResource.feature,
        ctxId: 'old',
      })
      if (failRefresh) await expect(operation).rejects.toThrow('Refresh failed')
      else await operation
      expect(reconcile).toHaveBeenCalledWith('feature')
      expect(restore).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    'keeps committed uploads distinct from refresh failures: %s',
    async failRefresh => {
      const ctx = new ImageCtx({}, createImageResources())
      await ctx.setContext({
        context: { ctxType: ImageContextResource.project, ctxId: 'old' },
      })
      let finish!: (value: ImageCtxEnvelope) => void
      vi.mocked(uploadAndProcessImage).mockReturnValue(
        new Promise(resolve => {
          finish = resolve
        }),
      )
      const reconcile = vi.spyOn(ctx.appCtx.resources, 'reconcile')
      if (failRefresh) reconcile.mockRejectedValue(new Error('Refresh failed'))
      else reconcile.mockResolvedValue(undefined)
      const failedUpload = vi.spyOn(ctx, 'setUploadError')
      const fileObject: ImageUpload = {
        file: new File(['abc'], 'image.jpg', { type: 'image/jpeg' }),
        status: 'uploading',
        retries: 0,
        queuedAt: 1000,
        optimisticKey: 'upload',
      }
      const operation = ctx.upload({ fileObject })
      await ctx.setContext({
        context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
      })
      finish({ image: { id: 'saved' } } as ImageCtxEnvelope)
      if (failRefresh) await expect(operation).rejects.toThrow('Refresh failed')
      else expect((await operation).image.id).toBe('saved')
      expect(reconcile).toHaveBeenCalledWith('project')
      expect(failedUpload).not.toHaveBeenCalled()
      expect(ctx.getImages()).toEqual([])
    },
  )

  it('does not restore a failed deletion into a different context', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
    })
    let reject!: (error: Error) => void
    vi.mocked(deleteImage).mockReturnValue(
      new Promise((_resolve, rej) => {
        reject = rej
      }) as ReturnType<typeof deleteImage>,
    )
    const pending = ctx.delete('old-image', {
      ctxType: ImageContextResource.feature,
      ctxId: 'old',
    })
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
    })
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
    const older = ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'old' },
    })
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'new' },
    })
    const reset = vi.spyOn(ctx, 'resetActiveImage')
    resolve()
    await older
    expect(reset).not.toHaveBeenCalled()
  })

  it('retains a rejected task image and its badge when the feature gallery refreshes', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    const rejected = {
      image: { id: 'rejected', isArchived: true },
      intent: null,
      isPublished: null,
    } as ImageCtxEnvelope
    const accepted = {
      image: { id: 'accepted' },
      intent: 'general',
      isPublished: true,
    } as ImageCtxEnvelope
    await ctx.setContext({
      context: {
        ctxType: ImageContextResource.feature,
        ctxId: 'feature',
        ctxTypeSecondary: ImageContextResourceExtended.task,
        ctxIdSecondary: 'reviewed-task',
      },
      images: [rejected, accepted],
      highlightedIds: ['rejected', 'accepted'],
    })
    vi.spyOn(ctx, 'imagesQueryFn').mockResolvedValue([accepted])
    vi.spyOn(ctx, 'extendedImagesQueryFn').mockResolvedValue([rejected, accepted])
    await ctx.refreshImages()
    expect(ctx.getImages().map(row => row.image.id)).toContain('rejected')
    const item = {
      id: 'rejected',
      intent: 'undefined',
      isPublished: ctx.getImage('rejected')!.isPublished,
    }
    expect(
      getTaskImageBadgeLabel(item, [item], true, id => ctx.isImageHighlighted(id)),
    ).toBe('REJECTED')
  })

  it('loads completed task evidence without reading a retired feature gallery', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    vi.spyOn(ctx, 'preloadImages').mockResolvedValue(undefined)
    await ctx.setContext({
      context: {
        ctxTypeSecondary: ImageContextResourceExtended.task,
        ctxIdSecondary: 'merged-task',
      },
    })
    const photo = {
      image: { id: 'submitted-photo', imageRevisionId: 'original' },
    } as ImageCtxEnvelope
    const primary = vi
      .spyOn(ctx, 'imagesQueryFn')
      .mockRejectedValue(new Error('Feature retired'))
    vi.spyOn(ctx, 'extendedImagesQueryFn').mockResolvedValue([photo])
    const setImages = vi.spyOn(ctx, 'setImages')
    await ctx.refreshImages()
    expect(primary).not.toHaveBeenCalled()
    expect(setImages).toHaveBeenCalledWith([photo])
  })

  it('clears fetching state when the current request fails', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    vi.spyOn(ctx, 'imagesQueryFn').mockRejectedValue(new Error('Read failed'))

    await expect(ctx.refreshImages()).rejects.toThrow('Read failed')
    expect(ctx.state.isFetchingImages).toBe(false)
  })

  it('ignores an older response without clearing the newer request loading state', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
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

  it('returns images while the intent policy is still pending', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: { ctxType: ImageContextResource.feature, ctxId: 'feature' },
    })
    let resolvePolicy!: (policy: {
      intents: []
      autoPublishUnclassified: boolean
    }) => void
    vi.mocked(getImageIntentOptions).mockReturnValueOnce(
      new Promise(resolve => {
        resolvePolicy = resolve
      }) as never,
    )
    vi.mocked(getImagesForContext).mockResolvedValueOnce({ data: [] } as never)
    await expect(ctx.imagesQueryFn()).resolves.toEqual([])
    resolvePolicy({ intents: [], autoPublishUnclassified: false })
    await vi.waitFor(() => expect(ctx.autoPublishUnclassified).toBe(false))
  })

  it('invalidates pending reads when only the secondary task changes', async () => {
    const ctx = new ImageCtx({}, createImageResources())
    await ctx.setContext({
      context: {
        ctxType: ImageContextResource.feature,
        ctxId: 'feature',
        ctxTypeSecondary: ImageContextResourceExtended.task,
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
        ctxType: ImageContextResource.feature,
        ctxId: 'feature',
        ctxTypeSecondary: ImageContextResourceExtended.task,
        ctxIdSecondary: 'new-task',
      },
    })
    const setImages = vi.spyOn(ctx, 'setImages')
    resolve([])
    await pending

    // Both requests start together, but neither may commit after the task changes.
    expect(secondary).toHaveBeenCalledOnce()
    expect(setImages).not.toHaveBeenCalled()
  })
})
