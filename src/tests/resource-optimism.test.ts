import { describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '$app/server'
import type {
  ResourcePage,
  PanelResource,
} from '#lib/api/services/resourcePage.types.js'
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import { withRemoteMeta } from './remote-function-mock'
vi.mock('#lib/api/resources.remote.js', () => ({
  getResourcePage: withRemoteMeta(vi.fn(), 'query'),
  getPinnedResource: withRemoteMeta(vi.fn(), 'query'),
}))
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { FeatureQuery } from '#lib/context/feature-query.svelte.js'
import { createResourceFormConfig } from '#lib/client/services/form.js'

function page(data: PanelResource[]) {
  const value: ResourcePage = { data, nextCursor: null }
  const transforms: Array<(value: ResourcePage) => ResourcePage> = []
  const query = {
    current: value,
    withOverride: vi.fn(transform => {
      transforms.push(transform)
      return { query, transform }
    }),
  } as unknown as RemoteQuery<ResourcePage>
  return { query, value, transforms }
}
const row = (id: string) => ({
  id,
  code: id,
  modifiedAt: '',
  isPublished: true,
  isArchived: false,
})

describe('native collection optimistic projections', () => {
  it('projects images into inactive index pages retained for back navigation', async () => {
    const cache = new CacheCtx()
    const first = page([
      {
        ...row('org'),
        image: { id: 'image', presentationMode: 'contain' },
      } as unknown as PanelResource,
    ])
    const second = page([row('other')])
    const { getResourcePage } = await import('#lib/api/resources.remote.js')
    vi.mocked(getResourcePage)
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const input = {
      type: 'organisation' as const,
      meta: { isAdminRequest: true, scope: 'admin' },
    }
    await cache.indexLists.organisation.load(input)
    await cache.indexLists.organisation.load({ ...input, q: 'other' })
    cache.optimisticUpdates('image', {
      meta: { id: 'image' },
      data: { presentationMode: 'cover' },
    })
    expect(first.transforms[0](first.value).data[0]).toMatchObject({
      image: { presentationMode: 'cover' },
    })
    expect(second.transforms).toHaveLength(0)
  })

  it.each([true, false])(
    'settles retained form edits alongside native updates (success=%s)',
    async success => {
      const cache = new CacheCtx()
      cache.entities.organisation.set('org', { ...row('org'), code: 'before' } as never)
      const config = createResourceFormConfig({
        formEl: undefined,
        key: 'org',
        schema: {} as never,
        data: {},
        submitUpdates: async () => [],
        adminCtx: { appCtx: { cacheCtx: cache } } as never,
        headerCtrl: {} as never,
        resourceType: 'organisation' as never,
        getEntity: () => null,
        refreshResource: async () => {},
      })
      const updates = (await config.onsubmitupdates({
        data: { meta: { id: 'org' }, data: { code: 'after' } },
      })) as import('#lib/context/featureQuery.types.js').OptimisticQueryUpdates
      expect(cache.entities.organisation.get('org')?.code).toBe('after')
      updates.settle?.(success)
      expect(cache.entities.organisation.get('org')?.code).toBe(
        success ? 'after' : 'before',
      )
    },
  )
  it('updates shared image metadata in index, panel, feature, pin and detail queries', async () => {
    const cache = new CacheCtx()
    const image = { id: 'image', presentationMode: 'contain', version: 1 }
    const panel = page([{ ...row('org'), image } as PanelResource])
    const index = page([
      { ...row('org'), image: { image } } as unknown as PanelResource,
    ])
    const feature = page([
      { ...row('feature'), images: [{ image }] } as unknown as PanelResource,
    ])
    cache.lists.organisation.pages = [panel.query]
    cache.indexLists.organisation.pages = [index.query]
    cache.featureCollection =
      feature.query as unknown as import('#lib/context/featureQuery.types.js').FeatureCollectionHandle
    cache.entities.organisation.set('org', { ...row('org'), image: { image } } as never)
    const detailTransforms: Array<(value: { data: unknown }) => { data: unknown }> = []
    const detail = Object.assign(
      Promise.resolve({ data: { ...row('org'), image: { image } } }),
      {
        current: { data: { ...row('org'), image: { image } } },
        withOverride: vi.fn(transform => {
          detailTransforms.push(transform)
          return () => {}
        }),
      },
    )
    await cache.ensureResource(
      JSON.stringify(['organisation', 'org']),
      () => detail as never,
      () => {},
    )
    const pinTransforms: Array<(value: unknown) => unknown> = []
    vi.mocked(
      (await import('#lib/api/resources.remote.js')).getPinnedResource,
    ).mockReturnValue({
      current: { ...row('org'), image },
      withOverride: vi.fn(transform => {
        pinTransforms.push(transform)
        return () => {}
      }),
    } as never)
    cache.pin('organisation', 'org', { isAdminRequest: true, scope: 'admin' })
    const mutation = cache.beginMutation('image', {
      meta: { id: 'image' },
      data: { presentationMode: 'cover', version: 2 },
    })
    expect(panel.transforms[0](panel.value).data[0]).toMatchObject({
      image: { presentationMode: 'cover', version: 2 },
    })
    expect(index.transforms[0](index.value).data[0]).toMatchObject({
      image: { image: { presentationMode: 'cover' } },
    })
    expect(feature.transforms[0](feature.value).data[0]).toMatchObject({
      images: [{ image: { presentationMode: 'cover' } }],
    })
    expect(detailTransforms[0](detail.current)).toMatchObject({
      data: { image: { image: { presentationMode: 'cover' } } },
    })
    expect(pinTransforms[0]({ image })).toMatchObject({
      image: { presentationMode: 'cover' },
    })
    expect(cache.entities.organisation.get('org')).toMatchObject({
      image: { image: { presentationMode: 'cover' } },
    })
    mutation.settle(false)
    expect(cache.entities.organisation.get('org')).toMatchObject({
      image: { image: { presentationMode: 'contain' } },
    })
    expect(image.presentationMode).toBe('contain')
  })
  it('patches retained pages past page six without mutating server snapshots', () => {
    const cache = new CacheCtx()
    const pages = Array.from({ length: 9 }, (_, i) => page([row(String(i))]))
    cache.lists.organisation.pages = pages.map(page => page.query)
    cache.optimisticUpdates('organisation', {
      meta: { id: '8' },
      data: { code: 'renamed' },
    })
    expect(pages[8].transforms[0](pages[8].value).data[0]).toMatchObject({
      code: 'renamed',
    })
    // Native settlement removes the override; no manual snapshot rollback can clobber another edit.
    expect(pages[8].value.data[0]).toMatchObject({ code: '8' })
    expect(pages[4].transforms).toHaveLength(0)
  })
  it('updates a visible descendant breadcrumb from its directly joined identity', () => {
    const cache = new CacheCtx()
    const descendant = page([
      {
        ...row('p'),
        organisationId: 'o',
        ancestors: { organisation: { id: 'o', code: 'old' } },
      } as PanelResource,
    ])
    cache.lists.project.pages = [descendant.query]
    cache.optimisticUpdates('organisation', {
      meta: { id: 'o' },
      data: { code: 'new' },
    })
    expect(
      (
        descendant.transforms[0](descendant.value).data[0] as {
          ancestors: { organisation: { code: string } }
        }
      ).ancestors.organisation.code,
    ).toBe('new')
    expect(descendant.value.data[0]).toMatchObject({
      ancestors: { organisation: { code: 'old' } },
    })
  })
  it('updates the active native feature collection during form submission', () => {
    const cache = new CacheCtx()
    const collection = page([row('feature')])
    cache.featureCollection =
      collection.query as unknown as import('#lib/context/featureQuery.types.js').FeatureCollectionHandle
    cache.optimisticUpdates('feature', {
      meta: { id: 'feature' },
      data: { isPublished: false },
    })
    expect(collection.transforms[0](collection.value).data[0].isPublished).toBe(false)
    expect(collection.value.data[0].isPublished).toBe(true)
  })

  it('hides accumulated map snapshots during a native override and restores them on rollback', async () => {
    const cache = new CacheCtx()
    const original: FeatureQueryPage = {
      data: [row('feature') as unknown as FeatureFromCollection],
      totalCount: null,
      facets: null,
      nextCursor: null,
    }
    const transforms: Array<(value: FeatureQueryPage) => FeatureQueryPage> = []
    const query = Object.assign(Promise.resolve(original), {
      current: original,
      ready: false,
      refresh: vi.fn(async () => {}),
      withOverride: vi.fn(transform => {
        transforms.push(transform)
        return { query, transform }
      }),
    }) as unknown as RemoteQuery<FeatureQueryPage>
    cache.featureQueries.map = new FeatureQuery(() => query, undefined, undefined, true)
    await cache.featureQueries.map.load({
      meta: { isAdminRequest: false, scope: 'public' },
    })
    expect(cache.featureQueries.map.rows).toHaveLength(1)

    cache.optimisticUpdates('feature', {
      meta: { id: 'feature' },
      data: { isPublished: false },
    })
    Object.assign(query, { current: transforms[0](original) })
    expect(cache.featureQueries.map.rows).toEqual([])

    // Native rollback restores visibility without mutating the accumulated server snapshot.
    Object.assign(query, { current: original })
    expect(cache.featureQueries.map.rows.map(feature => feature.id)).toEqual([
      'feature',
    ])
  })

  it('does not add a pending organisation to descendant collections', () => {
    const cache = new CacheCtx()
    const descendant = page([row('p')])
    cache.lists.project.pages = [descendant.query]
    cache.optimisticUpdates('organisation', {
      meta: { mode: 'create' },
      data: { code: 'new' },
    })
    expect(descendant.transforms[0](descendant.value).data).toEqual([row('p')])
  })
})

describe('profile-specific detail retention', () => {
  it('retains a compatible snapshot on transient refresh failure and discards it on denial', async () => {
    const cache = new CacheCtx()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const data = { id: 'detail', name: 'retained' }
    const handle = Object.assign(Promise.resolve({ data }), {
      current: { data } as { data: unknown } | undefined,
      refresh: vi.fn(async () => {}),
    })
    const commit = vi.fn()
    try {
      await expect(
        cache.ensureResource('organisation:detail:admin:scope', () => handle, commit),
      ).resolves.toEqual(data)
      now.mockReturnValue(302_000)
      handle.refresh.mockImplementation(async () => {
        handle.current = undefined
        throw new Error('Transient')
      })
      await expect(
        cache.ensureResource('organisation:detail:admin:scope', () => handle, commit),
      ).resolves.toEqual(data)
      await Promise.resolve()
      await expect(
        cache.ensureResource('organisation:detail:admin:scope', () => handle, commit),
      ).resolves.toEqual(data)
      handle.refresh.mockImplementation(async () => {
        throw { status: 403 }
      })
      await cache.ensureResource(
        'organisation:detail:admin:scope',
        () => handle,
        commit,
      )
      await vi.waitFor(() => expect(commit).toHaveBeenLastCalledWith(undefined))
    } finally {
      now.mockRestore()
    }
  })
})
