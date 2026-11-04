// TESTING
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#lib/api/feature.remote.js', () => ({ getFeatureForImport: vi.fn() }))
vi.mock('#lib/api/image.remote.js', () => ({
  getFeatureCanonicalImageOccupancy: vi.fn(),
}))
vi.mock('#lib/api/organisation.remote.js', () => ({ getOrganisation: vi.fn() }))
vi.mock('#lib/api/project.remote.js', () => ({ getProject: vi.fn() }))
vi.mock('#lib/client/services/image.js', () => ({
  calculateImageContentHash: vi.fn(),
  uploadAndProcessImage: vi.fn(),
}))
vi.mock('#lib/images/upload.js', () => ({
  normalizeUploadFileForAssetPipeline: vi.fn(),
}))

// API
import { getFeatureForImport } from '#lib/api/feature.remote.js'
import { getFeatureCanonicalImageOccupancy } from '#lib/api/image.remote.js'
import { getOrganisation } from '#lib/api/organisation.remote.js'
import { getProject } from '#lib/api/project.remote.js'
// SERVICES
import {
  calculateImageContentHash,
  uploadAndProcessImage,
} from '#lib/client/services/image.js'
import {
  getContextsForFeatures,
  handleImageDrop,
} from '#lib/client/services/import/images.js'
import { normalizeUploadFileForAssetPipeline } from '#lib/images/upload.js'
// TYPES
import type { BatchUploadResult } from '#lib/client/services/import/types.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFeatureForImport).mockImplementation(
    ({ id }) =>
      Promise.resolve({
        data: { id, projectId: 'project', organisationId: 'organisation', images: [] },
      }) as unknown as ReturnType<typeof getFeatureForImport>,
  )
  vi.mocked(getProject).mockResolvedValue({
    data: { id: 'project' },
  } as unknown as Awaited<ReturnType<typeof getProject>>)
  vi.mocked(getOrganisation).mockResolvedValue({
    data: { id: 'organisation' },
  } as unknown as Awaited<ReturnType<typeof getOrganisation>>)
  vi.mocked(getFeatureCanonicalImageOccupancy).mockResolvedValue({
    data: [],
  } as unknown as Awaited<ReturnType<typeof getFeatureCanonicalImageOccupancy>>)
  vi.mocked(normalizeUploadFileForAssetPipeline).mockImplementation(async file => ({
    file,
    originalFilename: file.name,
    originalExtension: 'jpg',
    originalWidth: 10,
    originalHeight: 10,
    uploadedWidth: 10,
    uploadedHeight: 10,
    wasResized: false,
  }))
  vi.mocked(calculateImageContentHash).mockResolvedValue('hash')
  vi.mocked(uploadAndProcessImage).mockResolvedValue({
    image: { id: 'saved' },
  } as Awaited<ReturnType<typeof uploadAndProcessImage>>)
})

afterEach(() => vi.restoreAllMocks())

describe('image import queue failures', () => {
  it.each(['decode', 'hash'])(
    'records a %s failure per file and continues through later batches',
    async phase => {
      const failure = new Error(`${phase} failed`)
      if (phase === 'decode')
        vi.mocked(normalizeUploadFileForAssetPipeline).mockRejectedValueOnce(failure)
      else vi.mocked(calculateImageContentHash).mockRejectedValueOnce(failure)
      const complete = vi.fn<(results: BatchUploadResult[]) => void>()
      const onError = vi.fn()

      const processing = handleImageDrop(
        {
          acceptedFiles: Array.from(
            { length: 6 },
            (_, index) =>
              new File(['image'], `feature${index}.jpg`, { type: 'image/jpeg' }),
          ),
          fileRejections: [],
        },
        vi.fn(),
        vi.fn(),
        complete,
        onError,
      )

      // Exercise the real inter-batch delay without spending 500ms of wall time.
      await vi.runAllTimersAsync()
      await processing

      expect(onError).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalledOnce()
      const results = complete.mock.calls[0][0]
      expect(results[0]).toMatchObject({ status: 'error', error: `${phase} failed` })
      expect(results.slice(1).every(result => result.status === 'success')).toBe(true)
      expect(uploadAndProcessImage).toHaveBeenCalledTimes(5)
    },
  )

  it('reports feature lookup failure and leaves no pending queue rows', async () => {
    const failure = new Error('Feature lookup unavailable')
    vi.mocked(getFeatureForImport).mockRejectedValue(failure)
    const update = vi.fn<(results: BatchUploadResult[]) => void>()
    const complete = vi.fn()
    const onError = vi.fn()

    await expect(
      handleImageDrop(
        {
          acceptedFiles: [new File(['image'], 'feature.jpg', { type: 'image/jpeg' })],
          fileRejections: [],
        },
        vi.fn(),
        update,
        complete,
        onError,
      ),
    ).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledWith(failure)
    expect(complete).not.toHaveBeenCalled()
    expect(update.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ status: 'error', error: failure.message }),
    ])
    expect(uploadAndProcessImage).not.toHaveBeenCalled()
  })
})

it('stops uploads and callbacks when cancellation occurs during hierarchy lookup', async () => {
  let current = true
  let finish!: (value: unknown) => void
  vi.mocked(getFeatureForImport).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve
    }) as never,
  )
  const progress = vi.fn()
  const update = vi.fn()
  const complete = vi.fn()
  const error = vi.fn()
  const pending = handleImageDrop(
    { acceptedFiles: [new File(['image'], 'feature.1.jpg')], fileRejections: [] },
    progress,
    update,
    complete,
    error,
    () => current,
  )
  current = false
  finish({ data: null })
  await pending
  expect(getProject).not.toHaveBeenCalled()
  expect(getOrganisation).not.toHaveBeenCalled()
  expect(getFeatureCanonicalImageOccupancy).not.toHaveBeenCalled()
  expect(uploadAndProcessImage).not.toHaveBeenCalled()
  expect(progress).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

it('stops before upload and later batches when cancelled during image hashing', async () => {
  let current = true
  let finish!: (hash: string) => void
  let reached!: () => void
  const hashing = new Promise<void>(resolve => {
    reached = resolve
  })
  const hash = new Promise<string>(resolve => {
    finish = resolve
  })
  vi.mocked(calculateImageContentHash).mockImplementation(() => {
    reached()
    return hash
  })
  const complete = vi.fn()
  const pending = handleImageDrop(
    {
      acceptedFiles: Array.from(
        { length: 6 },
        (_, index) => new File(['image'], `feature.${index + 1}.jpg`),
      ),
      fileRejections: [],
    },
    vi.fn(),
    vi.fn(),
    complete,
    vi.fn(),
    () => current,
  )
  await hashing
  current = false
  finish('hash')
  await pending
  expect(uploadAndProcessImage).not.toHaveBeenCalled()
  expect(normalizeUploadFileForAssetPipeline).toHaveBeenCalledTimes(5)
  expect(complete).not.toHaveBeenCalled()
})

it.each(['feature', 'project', 'organisation'])(
  'refreshes retained %s hierarchy before preparing uploads',
  async family => {
    const old =
      family === 'feature'
        ? {
            id: 'feature',
            projectId: 'project',
            organisationId: 'organisation',
            images: [],
          }
        : { id: family }
    const query = Object.assign(Promise.resolve({ data: old }), {
      current: { data: old } as { data: unknown },
      refresh: vi.fn(async () => {
        query.current = { data: null }
      }),
    })
    const remote =
      family === 'feature'
        ? getFeatureForImport
        : family === 'project'
          ? getProject
          : getOrganisation
    vi.mocked(remote).mockReturnValue(query as never)
    expect((await getContextsForFeatures(['feature'])).size).toBe(0)
    expect(query.refresh).toHaveBeenCalledOnce()
  },
)

it('refreshes canonical occupancy before deciding image import intent', async () => {
  const query = Object.assign(Promise.resolve({ data: [] as string[] }), {
    current: { data: [] as string[] },
    refresh: vi.fn(async () => {
      query.current = { data: ['feature'] }
    }),
  })
  vi.mocked(getFeatureCanonicalImageOccupancy).mockReturnValue(query as never)
  expect(
    (await getContextsForFeatures(['feature'])).get('feature')?.hasCanonicalImage,
  ).toBe(true)
  expect(query.refresh).toHaveBeenCalledOnce()
})
