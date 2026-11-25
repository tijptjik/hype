// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { premisesMapStorage } from '#lib/indoor/server/storage.js'

it('reads local map objects before stage originals and keeps local edits together', async () => {
  const local = {
    get: vi.fn().mockResolvedValueOnce('local review').mockResolvedValueOnce(null),
    put: vi.fn(),
  }
  const stage = { get: vi.fn().mockResolvedValue('mirrored release'), put: vi.fn() }
  const store = premisesMapStorage({
    env: {
      ENVIRONMENT: 'local',
      LOCAL_EXTERIOR_COMPARISONS: local,
      ASSET_RAW_DEV: stage,
    },
  } as unknown as App.Platform)

  expect(await store.get('interior-jobs/building/job/review.json')).toBe('local review')
  expect(stage.get).not.toHaveBeenCalled()
  expect(await store.get('premises-maps/building/releases/hash.json')).toBe(
    'mirrored release',
  )
  expect(stage.get).toHaveBeenCalledWith('premises-maps/building/releases/hash.json')
  await store.put('interior-jobs/building/active.json', '{"id":"next"}')
  expect(local.put).toHaveBeenCalledWith(
    'interior-jobs/building/active.json',
    '{"id":"next"}',
  )
  expect(stage.put).not.toHaveBeenCalled()
})

it.each([
  ['local', 'ASSET_RAW_DEV'],
  ['preview', 'ASSET_RAW_PREVIEW'],
  ['production', 'ASSET_RAW_PRODUCTION'],
])('uses the configured originals in %s', (environment, binding) => {
  const stage = { get: vi.fn(), put: vi.fn() }
  const env = {
    ENVIRONMENT: environment,
    [binding]: stage,
    LOCAL_EXTERIOR_COMPARISONS: environment === 'local' ? undefined : {},
  }
  expect(premisesMapStorage({ env } as unknown as App.Platform)).toBe(stage)
})
