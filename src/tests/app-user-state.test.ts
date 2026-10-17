import { AccountState } from '#lib/context/account.svelte.js'
import { describe, expect, it, vi } from 'vitest'
// CONTEXT
import { AppCtx } from '#lib/context/app.svelte.js'
// ENUMS
import { FirstClassResource, Panel } from '#lib/enums.js'
// TYPES
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { CurrentUser } from '#lib/db/zod/schema/user.types.js'
import type { DivisionCtx } from '#lib/context/division.svelte.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { SessionUser } from '#lib/types.js'
import type { UserFeature, UserProfile } from '#lib/db/zod/schema/user.types.js'

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
  it('keeps session role scope stable while user-layer preferences hydrate', async () => {
    const user = {
      id: 'member',
      preferences: {},
      roles: [{ type: 'organisation', organisationId: 'org', role: 'admin' }],
    } as unknown as CurrentUser
    const app = new AppCtx(
      {} as DivisionCtx,
      new AccountState(user as unknown as SessionUser),
      {} as ResponsiveCtx,
    )
    const scopeBefore = app.view.organisationsQueryKey()
    app.view.scope.selectionLayers = [{ id: 'default-layer' }] as Layer[]
    app.view.account.applyProfile({ userLayers: [] })
    app.view.syncAccount()
    expect(app.view.organisationsQueryKey()).toEqual(scopeBefore)
    expect(app.view.scope.selectionLayers.map(layer => layer.id)).toEqual([
      'default-layer',
    ])
  })

  it('does not let an older feature refresh overwrite a newer one', async () => {
    const first = createDeferred<FeatureFromCollection[]>()
    const second = createDeferred<FeatureFromCollection[]>()
    let queryCount = 0
    const appCtx = new AppCtx(
      { setDivisionFeatures: vi.fn() } as unknown as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    appCtx.view.queries.queryMap.set(FirstClassResource.feature, {
      queryKey: () => [FirstClassResource.feature],
      queryFn: () => (queryCount++ === 0 ? first.promise : second.promise),
    })

    const olderRefresh = appCtx.view.queries.refreshFeatures()
    const newerRefresh = appCtx.view.queries.refreshFeatures()

    second.resolve([
      { id: 'new-feature', layerId: 'new-layer', properties: [] },
    ] as FeatureFromCollection[])
    await newerRefresh
    expect(appCtx.view.queries.rows.feature.map(feature => feature.id)).toEqual([
      'new-feature',
    ])

    first.resolve([
      { id: 'old-feature', layerId: 'old-layer', properties: [] },
    ] as FeatureFromCollection[])
    await olderRefresh
    expect(appCtx.view.queries.rows.feature.map(feature => feature.id)).toEqual([
      'new-feature',
    ])
  })

  it('ignores a feature response when selected layers change before another refresh starts', async () => {
    const pending = createDeferred<FeatureFromCollection[]>()
    const appCtx = new AppCtx(
      { setDivisionFeatures: vi.fn() } as unknown as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    appCtx.view.scope.prisms.layer = ['old-layer']
    appCtx.view.queries.queryMap.set(FirstClassResource.feature, {
      queryKey: () => [FirstClassResource.feature],
      queryFn: () => pending.promise,
    })
    const refresh = appCtx.view.queries.refreshFeatures()
    appCtx.view.scope.prisms.layer = ['new-layer']
    pending.resolve([
      { id: 'obsolete', layerId: 'old-layer', properties: [] },
    ] as unknown as FeatureFromCollection[])
    await refresh
    expect(appCtx.view.queries.rows.feature).toEqual([])
    expect(appCtx.view.cache.feature.has('obsolete')).toBe(false)
  })

  it('does not restore feature data after the user identity changes', async () => {
    const pendingFeatures = createDeferred<FeatureFromCollection[]>()
    const appCtx = new AppCtx(
      { setDivisionFeatures: vi.fn() } as unknown as DivisionCtx,
      new AccountState({ id: 'old-user' } as unknown as SessionUser),
      {} as ResponsiveCtx,
    )
    appCtx.view.queries.queryMap.set(FirstClassResource.feature, {
      queryKey: () => [FirstClassResource.feature],
      queryFn: () => pendingFeatures.promise,
    })

    const refresh = appCtx.view.queries.refreshFeatures()
    appCtx.view.account.syncSession({ id: 'new-user' } as unknown as SessionUser)
    appCtx.view.syncAccount()

    pendingFeatures.resolve([
      { id: 'old-feature', layerId: 'old-layer', properties: [] },
    ] as FeatureFromCollection[])
    await refresh

    expect(appCtx.view.queries.rows.feature).toEqual([])
  })

  it('does not restore saved feature state after the user identity changes', async () => {
    const pendingUserFeatures = createDeferred<UserFeature[]>()
    const appCtx = new AppCtx(
      {} as DivisionCtx,
      new AccountState({ id: 'old-user' } as unknown as SessionUser),
      {} as ResponsiveCtx,
    )
    appCtx.view.queries.queryMap.set('userFeatures', {
      queryKey: () => ['userFeatures', 'old-user'],
      queryFn: () => pendingUserFeatures.promise,
    })

    const refresh = appCtx.view.queries.refreshUserFeatures()
    appCtx.view.account.syncSession({ id: 'new-user' } as unknown as SessionUser)
    appCtx.view.syncAccount()

    pendingUserFeatures.resolve([
      { featureId: 'old-feature', isWishlisted: true, isVisited: false },
    ] as UserFeature[])
    await refresh

    expect(appCtx.view.account.collections.state).toEqual({
      wishlisted: [],
      visited: [],
    })
  })

  it('does not commit a profile response after the user identity changes', async () => {
    const pendingProfile = createDeferred<UserProfile | null>()
    const appCtx = new AppCtx(
      {} as DivisionCtx,
      new AccountState({
        id: 'old-user',
        username: 'old-user',
      } as unknown as SessionUser),
      {} as ResponsiveCtx,
    )
    appCtx.view.panels.setPanelCtx(Panel.profile, 'username', 'old-user')
    appCtx.view.queries.queryMap.set(FirstClassResource.user, {
      queryKey: () => [FirstClassResource.user, 'old-user'],
      queryFn: () => pendingProfile.promise,
    })

    const refresh = appCtx.view.refreshUserProfile()
    appCtx.view.account.syncSession({
      id: 'new-user',
      username: 'new-user',
    } as unknown as SessionUser)
    appCtx.view.syncAccount()

    pendingProfile.resolve({ id: 'old-user', username: 'old-user' } as UserProfile)
    await refresh

    expect(appCtx.view.getUser()?.id).toBe('new-user')
    expect(appCtx.view.panels.state.profile.ctx?.userData).toBeNull()
  })

  it('does not let an older hierarchy refresh overwrite a newer one', async () => {
    const first = createDeferred<Project[]>()
    const second = createDeferred<Project[]>()
    let queryCount = 0
    const appCtx = new AppCtx(
      {} as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    appCtx.view.queries.queryMap.set(FirstClassResource.project, {
      queryKey: () => [FirstClassResource.project],
      queryFn: () => (queryCount++ === 0 ? first.promise : second.promise),
    })

    const olderRefresh = appCtx.view.queries.refreshProjects(false)
    const newerRefresh = appCtx.view.queries.refreshProjects(false)

    second.resolve([{ id: 'new-project' }] as Project[])
    await newerRefresh
    first.resolve([{ id: 'old-project' }] as Project[])
    await olderRefresh

    expect(appCtx.view.queries.rows.project).toEqual([{ id: 'new-project' }])
  })

  it('invalidates dependent resource caches before the next explicit refresh', async () => {
    const appCtx = new AppCtx(
      {} as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    appCtx.view.cache.project.set('p', { id: 'p' } as Project)
    appCtx.view.cache.property.set('v', { id: 'v' } as Property)
    await appCtx.view.invalidate(FirstClassResource.project)
    expect(appCtx.view.cache.project.size).toBe(0)
    expect(appCtx.view.cache.property.size).toBe(0)
  })

  it('loads profile data only when the profile panel opens', async () => {
    const appCtx = new AppCtx(
      {} as DivisionCtx,
      new AccountState({ id: 'user-1' } as unknown as SessionUser),
      {} as ResponsiveCtx,
    )
    const refreshUserProfile = vi.fn().mockResolvedValue(undefined)
    appCtx.view.refreshUserProfile = refreshUserProfile
    appCtx.view.panels.state.profile.ctx = {
      username: 'user-1',
      userData: null,
      observePrisms: true,
    }

    appCtx.view.panels.openPanel(Panel.profile, false)

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
      {} as DivisionCtx,
      new AccountState(user as unknown as SessionUser),
      {} as ResponsiveCtx,
    )

    appCtx.view.hub = { id: 'hub-1', code: 'test-hub' } as HubOptsExtended
    appCtx.view.queries.rows.layer = [{ id: 'saved-layer' }] as Layer[]
    appCtx.view.scope.prisms.layer = ['temporary-layer']

    appCtx.view.applyUserProfile({ username: 'after' })
    appCtx.view.syncAccount()

    expect(appCtx.view.scope.prisms.layer).toEqual(['temporary-layer'])
  })

  it('switches visible markers when active layers change before their feature refresh completes', () => {
    const appCtx = new AppCtx(
      {
        state: {
          contains: { feature: { neighbourhood: new Map() } },
          filters: { feature: { neighbourhood: { include: new Set() } } },
        },
        divisionFilterCount: 0,
      } as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    const features = [
      { id: 'bookshop-feature', layerId: 'bookshops', properties: [] },
      { id: 'neon-feature', layerId: 'neon-signs', properties: [] },
    ] as unknown as FeatureFromCollection[]

    vi.spyOn(appCtx.view.resources.featureQueries.map, 'rows', 'get').mockReturnValue(
      features,
    )
    appCtx.view.scope.prisms.layer = ['neon-signs']
    expect(appCtx.featuresVisible).toEqual(['neon-feature'])

    appCtx.view.scope.prisms.layer = ['bookshops']
    expect(appCtx.featuresVisible).toEqual(['bookshop-feature'])
    expect(appCtx.getVisibleFeatures().map(feature => feature.id)).toEqual([
      'bookshop-feature',
    ])
    appCtx.view.scope.prisms.layer = []
    expect(appCtx.getVisibleFeatures()).toEqual([])
  })

  it('removes stale map rows immediately when division selection changes', () => {
    const include = new Set<string>()
    const exclude = new Set<string>()
    const app = new AppCtx(
      {
        state: { filters: { feature: { neighbourhood: { include, exclude } } } },
      } as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )
    app.view.scope.prisms.layer = ['overlay']
    const rows = [
      {
        id: 'inside',
        layerId: 'overlay',
        divisionMemberships: [{ divisionId: 'district', selected: true }],
      },
      {
        id: 'outside',
        layerId: 'overlay',
        divisionMemberships: [{ divisionId: 'other', selected: true }],
      },
      {
        id: 'ambiguous',
        layerId: 'overlay',
        divisionMemberships: [{ divisionId: 'district', selected: false }],
      },
    ] as FeatureFromCollection[]
    vi.spyOn(app.view.resources.featureQueries.map, 'rows', 'get').mockReturnValue(rows)
    expect(app.getVisibleFeatures()).toHaveLength(3)
    include.add('district')
    expect(app.getVisibleFeatures().map(row => row.id)).toEqual(['inside'])
    include.clear()
    exclude.add('district')
    expect(app.getVisibleFeatures().map(row => row.id)).toEqual([
      'outside',
      'ambiguous',
    ])
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
      {} as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )

    appCtx.view.queries.queryMap.set(FirstClassResource.organisation, {
      queryKey: () => ['organisation'],
      queryFn: () => fetchQuery({ queryKey: ['organisation'] }),
    })
    appCtx.view.queries.queryMap.set(FirstClassResource.project, {
      queryKey: () => ['project'],
      queryFn: () => fetchQuery({ queryKey: ['project'] }),
    })
    const bootstrap = appCtx.bootstrapPublicMapResources(false)
    await vi.waitFor(() => expect(fetchQuery).toHaveBeenCalledTimes(2))

    appCtx.view.account.syncSession({ id: 'account-user' } as unknown as SessionUser)
    appCtx.view.syncAccount()
    appCtx.view.queries.rows.organisation = [
      { id: 'account-organisation' },
    ] as Organisation[]
    appCtx.view.queries.rows.project = [{ id: 'account-project' }] as Project[]
    appCtx.view.scope.prisms.organisation = ['account-organisation']
    appCtx.view.scope.prisms.project = ['account-project']

    organisations.resolve([{ id: 'public-organisation' }] as Organisation[])
    projects.resolve([{ id: 'public-project' }] as Project[])
    await bootstrap

    expect(appCtx.view.queries.rows.organisation).toEqual([
      { id: 'account-organisation' },
    ])
    expect(appCtx.view.queries.rows.project).toEqual([{ id: 'account-project' }])
    expect(appCtx.view.scope.prisms.organisation).toEqual(['account-organisation'])
    expect(appCtx.view.scope.prisms.project).toEqual(['account-project'])
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
      {} as DivisionCtx,
      new AccountState(null),
      {} as ResponsiveCtx,
    )

    appCtx.view.queries.queryMap.set(FirstClassResource.layer, {
      queryKey: () => ['layer'],
      queryFn: () => fetchQuery({ queryKey: ['layer'] }),
    })
    appCtx.view.queries.queryMap.set(FirstClassResource.property, {
      queryKey: () => ['property'],
      queryFn: () => fetchQuery({ queryKey: ['property'] }),
    })
    const refreshLayers = appCtx.view.queries.refreshLayers(false, true, 'anonymous::')
    const refreshProperties = appCtx.view.queries.refreshProperties(
      false,
      'anonymous::',
    )
    await vi.waitFor(() => expect(fetchQuery).toHaveBeenCalledTimes(2))

    appCtx.view.account.syncSession({ id: 'account-user' } as unknown as SessionUser)
    appCtx.view.syncAccount()
    appCtx.view.queries.rows.layer = [{ id: 'account-layer' }] as Layer[]
    appCtx.view.scope.prisms.layer = ['account-layer']
    appCtx.view.cache.property.set('account-property', {
      id: 'account-property',
    } as Property)

    layers.resolve([{ id: 'public-layer' }] as Layer[])
    properties.resolve([{ id: 'public-property' }] as Property[])
    await Promise.all([refreshLayers, refreshProperties])

    expect(appCtx.view.queries.rows.layer).toEqual([{ id: 'account-layer' }])
    expect(appCtx.view.scope.prisms.layer).toEqual(['account-layer'])
    expect(appCtx.view.cache.property.has('public-property')).toBe(false)
    expect(appCtx.view.cache.property.has('account-property')).toBe(true)
  })
})
