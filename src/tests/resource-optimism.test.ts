import { describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '@sveltejs/kit'
import type { ResourcePage, PanelResource } from '$lib/types'
import { withRemoteMeta } from './remote-function-mock'
vi.mock('$lib/api/server/resources.remote', () => ({
  getResourcePage: withRemoteMeta(vi.fn(), 'query'),
  getPinnedResource: withRemoteMeta(vi.fn(), 'query'),
}))
import { CacheCtx } from '$lib/context/cache.svelte'

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
  it('patches retained pages past page six without mutating server snapshots', () => {
    const cache = new CacheCtx()
    const pages = Array.from({ length: 9 }, (_, i) => page([row(String(i))]))
    cache.lists.organisation.pages = pages.map(page => page.query)
    cache.optimisticUpdates('organisation', {
      meta: { id: '8' },
      data: { code: 'renamed' },
    })
    expect(pages[8].transforms[0](pages[8].value).data[0].code).toBe('renamed')
    // Native settlement removes the override; no manual snapshot rollback can clobber another edit.
    expect(pages[8].value.data[0].code).toBe('8')
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
