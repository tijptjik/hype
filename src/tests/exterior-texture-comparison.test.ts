// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { textureComparisonFile } from '#lib/locations/exterior/textureComparison.server.js'

it('finds the exact immutable GLB for a source revision in the local comparison bucket', async () => {
  const file = `comparison-${'ab'.repeat(32)}.glb`
  const get = vi.fn().mockResolvedValue({ json: async () => ({ file }) })
  const platform = {
    env: { ENVIRONMENT: 'local', LOCAL_EXTERIOR_COMPARISONS: { get } },
  } as unknown as App.Platform
  expect(await textureComparisonFile(platform, 'source')).toBe(file)
  expect(get).toHaveBeenCalledWith('location-exteriors/source/texture-comparison.json')
})

it('keeps ordinary sources available for a missing or invalid pointer', async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ json: async () => ({ file: 'another-asset/file.glb' }) })
  const platform = {
    env: { ENVIRONMENT: 'local', ASSET_RAW_DEV: { get } },
  } as unknown as App.Platform
  expect(await textureComparisonFile(platform, 'source')).toBeNull()
  expect(await textureComparisonFile(platform, 'source')).toBeNull()
})
