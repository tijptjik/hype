import { describe, expect, it, vi } from 'vitest'
// CONTEXT
import { AppCtx } from '$lib/context/app.svelte'
// ENUMS
import { FirstClassResource, Panel } from '$lib/enums'
// TYPES
import type { QueryClient } from '@tanstack/svelte-query'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { CurrentUser } from '$lib/db/zod/schema/user.types'
import type { PlaceCtx } from '$lib/context/place.svelte'
import type { ResponsiveCtx } from '$lib/context/responsive.svelte'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Property } from '$lib/db/zod/schema/property.types'

/** Creates a promise whose completion is controlled by the test. */
function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('AppCtx user updates', () => {
  it('does not let an older feature refresh overwrite a newer one', async () => {
    const first = createDeferred<FeatureFromCollection[]>()
    const second = createDeferred<FeatureFromCollection[]>()
    let queryCount = 0
    const appCtx = new AppCtx(
      {
        fetchQuery: vi.fn(({ queryFn }: { queryFn: () => Promise<unknown> }) =>
          queryFn(),
        ),
        removeQueries: vi.fn(),
      } as unknown as QueryClient,
      { setNeighbourhoodFeatures: vi.fn() } as unknown as PlaceCtx,
      null,
      {} as ResponsiveCtx,
    )
    appCtx.queryMap.set(FirstClassResource.feature, {
      queryKey: () => [FirstClassResource.feature],
      queryFn: () => (queryCount++ === 0 ? first.promise : second.promise),
    })

    const olderRefresh = appCtx.refreshFeatures()
    const newerRefresh = appCtx.refreshFeatures()

    second.resolve([
      { id: 'new-feature', layerId: 'new-layer', properties: [] },
    ] as FeatureFromCollection[])
    await newerRefresh
    expect(appCtx.state.resources.feature.map(feature => feature.id)).toEqual([
      'new-feature',
    ])

    first.resolve([
      { id: 'old-feature', layerId: 'old-layer', properties: [] },
    ] as FeatureFromCollection[])
    await olderRefresh
    expect(appCtx.state.resources.feature.map(feature => feature.id)).toEqual([
      'new-feature',
    ])
  })

  it('waits for dependent query invalidations before resolving', async () => {
    const appCtx = new AppCtx(
      { removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      null,
      {} as ResponsiveCtx,
    )
    const invalidation = createDeferred<void>()
    const invalidateQueries = vi.fn().mockReturnValue(invalidation.promise)
    appCtx.queryClient = { invalidateQueries } as unknown as QueryClient

    let settled = false
    const pending = appCtx.invalidate(FirstClassResource.project).then(() => {
      settled = true
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    expect(settled).toBe(false)

    invalidation.resolve()
    await pending
    expect(settled).toBe(true)
  })

  it('loads profile data only when the profile panel opens', async () => {
    const appCtx = new AppCtx(
      { removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      { id: 'user-1' } as CurrentUser,
      { setPanelOpen: vi.fn() } as ResponsiveCtx,
    )
    const refreshUserProfile = vi.fn().mockResolvedValue(undefined)
    appCtx.refreshUserProfile = refreshUserProfile
    appCtx.state.panels.profile.ctx = {
      username: 'user-1',
      userData: null,
      observePrisms: true,
    }

    appCtx.openPanel(Panel.profile, false)

    await vi.waitFor(() => expect(refreshUserProfile).toHaveBeenCalledWith(false))
  })

  it('preserves active layers when updating the current user profile', async () => {
    const user = {
      id: 'user-1',
      username: 'before',
      userLayers: [
        {
          userId: 'user-1',
          hubId: 'hub-1',
          layerId: 'saved-layer',
          isDefaultVisible: true,
        },
      ],
    } as CurrentUser
    const appCtx = new AppCtx(
      { removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      user,
      {} as ResponsiveCtx,
    )

    appCtx.hub = { id: 'hub-1', code: 'test-hub' } as HubOptsExtended
    appCtx.state.resources.layer = [{ id: 'saved-layer' }] as Layer[]
    appCtx.state.prisms.layer = ['temporary-layer']

    await appCtx.setUser({ ...user, username: 'after' })

    expect(appCtx.state.prisms.layer).toEqual(['temporary-layer'])
  })

  it('switches visible markers when active layers change before their feature refresh completes', () => {
    const appCtx = new AppCtx(
      { removeQueries: vi.fn() } as unknown as QueryClient,
      {
        state: {
          contains: { feature: { neighbourhood: new Map() } },
          filters: { feature: { neighbourhood: { include: new Set() } } },
        },
        neighbourhoodFilterCount: 0,
      } as PlaceCtx,
      null,
      {} as ResponsiveCtx,
    )
    const features = [
      { id: 'bookshop-feature', layerId: 'bookshops', properties: [] },
      { id: 'neon-feature', layerId: 'neon-signs', properties: [] },
    ] as FeatureFromCollection[]

    features.forEach(feature => {
      appCtx.addFeatureToMap(feature)
    })
    appCtx.state.prisms.layer = ['neon-signs']
    expect(appCtx.featuresVisible).toEqual(['neon-feature'])

    appCtx.state.prisms.layer = ['bookshops']
    expect(appCtx.featuresVisible).toEqual(['bookshop-feature'])
  })

  it('does not commit the anonymous hierarchy after the session identity changes', async () => {
    const organisations = createDeferred<Organisation[]>()
    const projects = createDeferred<Project[]>()
    const fetchQuery = vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === 'organisation') return organisations.promise
      if (queryKey[0] === 'project') return projects.promise
      throw new Error(`Unexpected public bootstrap query: ${String(queryKey[0])}`)
    })
    const appCtx = new AppCtx(
      { fetchQuery, removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      null,
      {} as ResponsiveCtx,
    )

    const bootstrap = appCtx.bootstrapPublicMapResources(false)
    await vi.waitFor(() => expect(fetchQuery).toHaveBeenCalledTimes(2))

    await appCtx.setUser({ id: 'account-user' } as CurrentUser)
    appCtx.state.resources.organisation = [
      { id: 'account-organisation' },
    ] as Organisation[]
    appCtx.state.resources.project = [{ id: 'account-project' }] as Project[]
    appCtx.state.prisms.organisation = ['account-organisation']
    appCtx.state.prisms.project = ['account-project']

    organisations.resolve([{ id: 'public-organisation' }] as Organisation[])
    projects.resolve([{ id: 'public-project' }] as Project[])
    await bootstrap

    expect(appCtx.state.resources.organisation).toEqual([
      { id: 'account-organisation' },
    ])
    expect(appCtx.state.resources.project).toEqual([{ id: 'account-project' }])
    expect(appCtx.state.prisms.organisation).toEqual(['account-organisation'])
    expect(appCtx.state.prisms.project).toEqual(['account-project'])
  })

  it('does not commit anonymous layers, properties, or layer prisms after sign-in', async () => {
    const layers = createDeferred<Layer[]>()
    const properties = createDeferred<Property[]>()
    const fetchQuery = vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === 'layer') return layers.promise
      if (queryKey[0] === 'property') return properties.promise
      throw new Error(`Unexpected public bootstrap query: ${String(queryKey[0])}`)
    })
    const appCtx = new AppCtx(
      { fetchQuery, removeQueries: vi.fn() } as unknown as QueryClient,
      {} as PlaceCtx,
      null,
      {} as ResponsiveCtx,
    )

    const refreshLayers = appCtx.refreshLayers(false, true, 'anonymous::')
    const refreshProperties = appCtx.refreshProperties(false, 'anonymous::')
    await vi.waitFor(() => expect(fetchQuery).toHaveBeenCalledTimes(2))

    await appCtx.setUser({ id: 'account-user' } as CurrentUser)
    appCtx.state.resources.layer = [{ id: 'account-layer' }] as Layer[]
    appCtx.state.prisms.layer = ['account-layer']
    appCtx.cache.property.set('account-property', {
      id: 'account-property',
    } as Property)

    layers.resolve([{ id: 'public-layer' }] as Layer[])
    properties.resolve([{ id: 'public-property' }] as Property[])
    await Promise.all([refreshLayers, refreshProperties])

    expect(appCtx.state.resources.layer).toEqual([{ id: 'account-layer' }])
    expect(appCtx.state.prisms.layer).toEqual(['account-layer'])
    expect(appCtx.cache.property.has('public-property')).toBe(false)
    expect(appCtx.cache.property.has('account-property')).toBe(true)
  })
})
