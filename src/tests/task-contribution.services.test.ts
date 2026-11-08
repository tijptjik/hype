// @vitest-environment node
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#lib/db/services/featureCreationRevision.js', () => ({
  featureRevisionCreationEnabled: vi.fn(async () => false),
}))
vi.mock('#lib/api/services/feature.js', () => ({
  createUserContributedFeatureTask: mocks.create,
}))
import { createTaskWithDependencies } from '#lib/db/services/task.js'

it('submits a new contribution through one combined creation with session attribution', async () => {
  const task = { id: 'task', featureId: 'feature', isDraft: false }
  mocks.create.mockResolvedValue({ feature: { id: 'feature' }, task })
  const db = {} as never
  const input = {
    type: 'newFeature' as const,
    organisationId: 'org',
    projectId: 'project',
    layerId: 'layer',
    contributorId: 'spoofed',
    feature: { layerId: 'layer', contributorId: 'spoofed', isDraft: true },
  }
  await expect(
    createTaskWithDependencies(db, input as never, [], 'account', 'region', 'key'),
  ).resolves.toBe(task)
  expect(mocks.create).toHaveBeenCalledWith(
    db,
    { layerId: 'layer', contributorId: 'account', isDraft: false },
    'region',
    'key',
    { contributorId: 'account' },
  )
})
