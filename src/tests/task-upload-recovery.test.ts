// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  draft: vi.fn(),
  reportDraft: vi.fn(),
  featureDraft: vi.fn(),
  submit: vi.fn(),
  prepare: vi.fn(),
  upload: vi.fn(),
  finalize: vi.fn(),
}))
vi.mock('#lib/api/tasks.remote.js', () => ({
  beginNewPhotosDraft: mocks.draft,
  beginMissingReportDraft: mocks.reportDraft,
  beginNewFeatureDraft: mocks.featureDraft,
  finalizeTaskDraft: mocks.submit,
  reviewTask: vi.fn(),
}))
vi.mock('#lib/api/feature.remote.js', () => ({ updateFeatureState: vi.fn() }))
vi.mock('#lib/i18n.js', () => ({
  m: {
    task_submission__drafting_photos: () => 'draft',
    task_submission__uploading_image: () => 'upload',
    task_submission__submitting_photos: () => 'submit',
    task_submission__submitting_feature: () => 'submit',
    task_submission__submitting_report: () => 'submit',
  },
}))
vi.mock('#lib/client/services/image.js', () => ({
  prepareImageUpload: mocks.prepare,
  uploadPreparedImageObject: mocks.upload,
  finalizePreparedImageUpload: mocks.finalize,
  getGalleryItemTargetImageId: vi.fn(),
}))
import { TaskSubmissionRetry } from '#lib/client/services/taskSubmissionRetry.js'
import {
  submitNewPhotos,
  submitMissingReport,
  submitNewFeature,
} from '#lib/client/services/task.js'

beforeEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  mocks.submit.mockResolvedValue({ data: { id: 'task', isDraft: false } })
  mocks.draft.mockResolvedValue({ data: { id: 'task' } })
  mocks.prepare.mockImplementation(async file => ({ file }))
  mocks.upload.mockResolvedValue(undefined)
  mocks.finalize.mockResolvedValue({})
})

it.each(['prepare', 'upload', 'finalize'] as const)(
  'waits for other %s work before exposing a failure for retry',
  async stage => {
    let finish!: () => void
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    const failure = new Error(`${stage} failed`)
    mocks[stage]
      .mockImplementationOnce(async () => {
        throw failure
      })
      .mockImplementationOnce(async () => {
        await pending
        return { file: new File([], 'second') }
      })
    let settled = false
    const saving = submitNewPhotos(
      { id: 'feature' } as never,
      { id: 'layer' } as never,
      { id: 'project' } as never,
      { id: 'org' } as never,
      [
        { file: new File([], 'first') },
        { file: new File([], 'second') },
        ...(stage === 'finalize' ? [{ file: new File([], 'third') }] : []),
      ] as never,
    )
    void saving.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await vi.waitFor(() => expect(mocks[stage]).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    try {
      expect(settled).toBe(false)
    } finally {
      finish()
      await expect(saving).rejects.toBe(failure)
    }
    expect(mocks.submit).not.toHaveBeenCalled()
    if (stage === 'finalize') expect(mocks.finalize).toHaveBeenCalledTimes(2)
    if (stage === 'prepare') expect(mocks.upload).not.toHaveBeenCalled()
    if (stage !== 'finalize') expect(mocks.finalize).not.toHaveBeenCalled()
  },
)

it('keeps successful finalization bounded to two workers and submits only after all finish', async () => {
  const releases: Array<() => void> = []
  let active = 0
  let maximum = 0
  mocks.finalize.mockImplementation(async () => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise<void>(resolve => releases.push(resolve))
    active--
    return {}
  })
  const saving = submitNewPhotos(
    { id: 'feature' } as never,
    { id: 'layer' } as never,
    { id: 'project' } as never,
    { id: 'org' } as never,
    ['first', 'second', 'third'].map(name => ({ file: new File([], name) })) as never,
  )
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  expect(mocks.submit).not.toHaveBeenCalled()
  releases[0]()
  await vi.waitFor(() => expect(releases).toHaveLength(3))
  expect(maximum).toBe(2)
  expect(mocks.submit).not.toHaveBeenCalled()
  releases[1]()
  releases[2]()
  expect(await (await saving).json()).toEqual({ data: { id: 'task', isDraft: false } })
  expect(mocks.submit).toHaveBeenCalledOnce()
})

it.each(['prepare', 'upload', 'finalize', 'submit'] as const)(
  'reuses the task and acknowledged upload stages after a %s failure',
  async stage => {
    const retry = { session: new TaskSubmissionRetry(), scope: () => 'account:1' }
    const photos = ['first', 'second'].map(name => ({ file: new File([], name) }))
    const submit = () =>
      submitNewPhotos(
        { id: 'feature' } as never,
        { id: 'layer' } as never,
        { id: 'project' } as never,
        { id: 'org' } as never,
        photos as never,
        { retry },
      )
    mocks[stage].mockRejectedValueOnce(new Error('temporary'))
    await expect(submit()).rejects.toThrow('temporary')
    expect(await (await submit()).json()).toEqual({
      data: { id: 'task', isDraft: false },
    })
    expect(mocks.draft).toHaveBeenCalledTimes(1)
    expect(mocks.prepare).toHaveBeenCalledTimes(stage === 'prepare' ? 3 : 2)
    expect(mocks.upload).toHaveBeenCalledTimes(stage === 'upload' ? 3 : 2)
    expect(mocks.finalize).toHaveBeenCalledTimes(stage === 'finalize' ? 3 : 2)
    expect(mocks.submit).toHaveBeenCalledTimes(stage === 'submit' ? 2 : 1)
  },
)

it.each(['report', 'feature'] as const)(
  'retries %s submission acknowledgment without recreating its draft or images',
  async kind => {
    mocks.reportDraft.mockResolvedValue({ data: { id: 'task' } })
    mocks.featureDraft.mockResolvedValue({
      data: {
        task: { id: 'task' },
        featureId: 'feature',
        layerId: 'layer',
        projectId: 'project',
        organisationId: 'org',
      },
    })
    mocks.submit.mockRejectedValueOnce(new Error('response lost'))
    const retry = { session: new TaskSubmissionRetry(), scope: () => 'account' }
    const photos = [{ file: new File([], 'photo') }]
    const feature = {
      layerId: 'layer',
      projectId: 'project',
      organisationId: 'org',
      feature: { i18n: { en: { title: 'Name' } } },
    }
    const submit = () =>
      kind === 'report'
        ? submitMissingReport(
            { id: 'feature' } as never,
            { id: 'layer' } as never,
            { id: 'project' } as never,
            { id: 'org' } as never,
            'Missing here',
            photos as never,
            { retry },
          )
        : submitNewFeature(feature as never, photos as never, { retry })
    await expect(submit()).rejects.toThrow('response lost')
    expect(await (await submit()).json()).toEqual({
      data: { id: 'task', isDraft: false },
    })
    expect(
      kind === 'report' ? mocks.reportDraft : mocks.featureDraft,
    ).toHaveBeenCalledTimes(1)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.finalize).toHaveBeenCalledTimes(1)
    expect(mocks.submit).toHaveBeenCalledTimes(2)
  },
)
