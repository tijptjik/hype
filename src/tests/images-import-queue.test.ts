// TESTING
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/api/server/feature.remote', () => ({ getFeatureForImport: vi.fn() }))
vi.mock('$lib/api/server/image.remote', () => ({
  getFeatureCanonicalImageOccupancy: vi.fn(),
}))
vi.mock('$lib/api/server/organisation.remote', () => ({ getOrganisation: vi.fn() }))
vi.mock('$lib/api/server/project.remote', () => ({ getProject: vi.fn() }))
vi.mock('$lib/client/services/image', () => ({
  calculateImageContentHash: vi.fn(),
  uploadAndProcessImage: vi.fn(),
}))
vi.mock('$lib/images/upload', () => ({ normalizeUploadFileForAssetPipeline: vi.fn() }))

// API
import { getFeatureForImport } from '$lib/api/server/feature.remote'
import { getFeatureCanonicalImageOccupancy } from '$lib/api/server/image.remote'
import { getOrganisation } from '$lib/api/server/organisation.remote'
import { getProject } from '$lib/api/server/project.remote'
// SERVICES
import {
  calculateImageContentHash,
  uploadAndProcessImage,
} from '$lib/client/services/image'
import { handleImageDrop } from '$lib/client/services/import/images'
import { normalizeUploadFileForAssetPipeline } from '$lib/images/upload'
// TYPES
import type { BatchUploadResult } from '$lib/client/services/import/types'

beforeEach(() => {
  vi.useRealTimers()
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

      await handleImageDrop(
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
