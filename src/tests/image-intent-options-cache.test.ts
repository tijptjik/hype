import { describe, expect, it, vi } from 'vitest'
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import { loadImageIntentOptions } from '#lib/client/services/imageIntentOptions.js'
import { getImageIntentOptions } from '#lib/api/image.remote.js'
import { DEFAULT_IMAGE_INTENTS } from '#lib/images/intents.js'

vi.mock('#lib/api/image.remote.js', () => ({ getImageIntentOptions: vi.fn() }))
const policy = { intents: [...DEFAULT_IMAGE_INTENTS], autoPublishUnclassified: true }

function fixture() {
  const cache = new CacheCtx()
  const view = {
    cache: cache.entities,
    resources: new ResourceClient(cache, () => 'admin'),
  }
  vi.mocked(getImageIntentOptions).mockReset().mockResolvedValue(policy)
  return { cache, view }
}

describe('project image intent caching', () => {
  it('shares in-flight and completed options across tasks and feature viewers', async () => {
    const { view } = fixture()
    const first = loadImageIntentOptions(
      view,
      { ctxType: 'task', ctxId: 'one' },
      'project',
    )
    const second = loadImageIntentOptions(
      view,
      { ctxType: 'feature', ctxId: 'two' },
      'project',
    )
    expect(first).toBe(second)
    await first
    await loadImageIntentOptions(view, { ctxType: 'task', ctxId: 'three' }, 'project')
    expect(getImageIntentOptions).toHaveBeenCalledOnce()
    expect(getImageIntentOptions).toHaveBeenCalledWith(
      expect.objectContaining({ ctxType: 'project', ctxId: 'project' }),
    )
  })

  it('isolates projects and access scopes', async () => {
    const { cache, view } = fixture()
    await loadImageIntentOptions(view, { ctxType: 'project', ctxId: 'one' })
    await loadImageIntentOptions(view, { ctxType: 'project', ctxId: 'two' })
    await loadImageIntentOptions(
      { ...view, resources: new ResourceClient(cache, () => 'other') },
      { ctxType: 'project', ctxId: 'one' },
    )
    expect(getImageIntentOptions).toHaveBeenCalledTimes(3)
  })

  it('retains policy through image changes and invalidates after project, hub and account changes', async () => {
    const { cache, view } = fixture()
    const load = () =>
      loadImageIntentOptions(view, { ctxType: 'project', ctxId: 'one' })
    await load()
    await cache.reconcile('image')
    await load()
    expect(getImageIntentOptions).toHaveBeenCalledOnce()
    for (const owner of ['project', 'hub']) {
      await cache.reconcile(owner)
      await load()
    }
    cache.clear()
    await load()
    expect(getImageIntentOptions).toHaveBeenCalledTimes(4)
  })

  it('allows retries after a failed request', async () => {
    const { view } = fixture()
    vi.mocked(getImageIntentOptions).mockRejectedValueOnce(new Error('offline'))
    await expect(
      loadImageIntentOptions(view, { ctxType: 'project', ctxId: 'one' }),
    ).rejects.toThrow('offline')
    await expect(
      loadImageIntentOptions(view, { ctxType: 'project', ctxId: 'one' }),
    ).resolves.toEqual(policy)
    expect(getImageIntentOptions).toHaveBeenCalledTimes(2)
  })
})
