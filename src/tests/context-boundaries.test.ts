import { describe, expect, it, vi } from 'vitest'
import { AppCtx } from '#lib/context/app.svelte.js'
import { AdminCtx } from '#lib/context/admin.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { RootCTX } from '#lib/context/root.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { MapController } from '#lib/map/controller.js'
import type { SessionUser } from '#lib/types.js'
import { FirstClassResource, Panel, NewFeatureMode } from '#lib/enums.js'

describe('surface context boundaries', () => {
  it('owns canonical panel state and geometry independently on each surface', () => {
    const viewport = new ResponsiveCtx()
    viewport.setWindowDimensions(1500, 900)
    const root = new RootCTX(viewport)
    const app = new AppCtx(new DivisionCtx(), root.account, viewport, root.cacheCtx)
    const admin = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      viewport,
      root.cacheCtx,
      'admin',
    )
    expect(app).not.toBeInstanceOf(ResourceViewCtx)
    expect(app.view).toBeInstanceOf(ResourceViewCtx)
    app.view.layout.setMainDimensions(1400, 800)
    admin.layout.setMainDimensions(1000, 700)
    app.view.panels.openPanel(Panel.prisms, false)
    app.view.panels.openPanelVisually(Panel.filters)
    expect(app.view.layout.panels).toBe(app.view.panels)
    expect(app.view.panels.state.prisms.isOpen).toBe(true)
    expect(app.view.panels.isPanelOpen(Panel.prisms)).toBe(true)
    expect(admin.panels.isPanelOpen(Panel.prisms)).toBe(false)
    expect(admin.panels.isPanelOpenVisually(Panel.filters)).toBe(false)
    expect(admin.layout.main.width).toBe(1000)
    app.view.panels.closePanel(Panel.prisms, false)
    expect(app.view.layout.getEffectiveAppMainWidth()).toBe(1400)
    app.dispose()
    admin.dispose()
  })

  it('discards creation payload and stage when the account changes', () => {
    const root = new RootCTX(new ResponsiveCtx())
    root.sync({ id: 'alice', roles: [] } as unknown as SessionUser, null)
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    view.draft.set({ taskId: 'alice-task', feature: {} })
    view.draft.setMode(NewFeatureMode.parents)
    view.syncAccount()
    expect(view.draft.current?.taskId).toBe('alice-task')
    root.sync({ id: 'bob', roles: [] } as unknown as SessionUser, null)
    view.syncAccount()
    expect(view.draft.current).toBeNull()
    expect(view.draft.mode).toBeNull()
    view.dispose()
  })

  it('keeps public camera commands optional and independent of resource readiness', async () => {
    const root = new RootCTX(new ResponsiveCtx())
    const app = new AppCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    expect(app.getMapCenter()).toBeNull()
    const fitBounds = vi.fn()
    app.mapController = {
      getCamera: () => ({ center: [114.2, 22.4], zoom: 10, bearing: 0, pitch: 0 }),
      fitBounds,
    } as unknown as MapController
    expect(app.getMapCenter()).toEqual([114.2, 22.4])
    app.zoomToCoordinates([
      [114.1, 22.3],
      [114.3, 22.5],
    ])
    expect(fitBounds).toHaveBeenCalledOnce()
    app.mapController = null
    app.zoomToCoordinates([[114.1, 22.3]])
    expect(fitBounds).toHaveBeenCalledOnce()
    expect(app.getMapCenter()).toBeNull()
    const admin = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    await admin.init(null)
    expect(admin.isInitialised).toBe(true)
    app.dispose()
    admin.dispose()
  })

  it('shares self-profile updates while retaining root session authority', () => {
    const root = new RootCTX(new ResponsiveCtx())
    root.sync(
      {
        id: 'alice',
        roles: [],
        superAdmin: false,
        username: 'alice',
        preferences: {},
      } as unknown as SessionUser,
      null,
    )
    const app = new AppCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    const admin = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    const before = admin.organisationsQueryKey()
    app.view.applyUserProfile({ username: 'updated', attribution: 'Alice' })
    expect(admin.getUser()?.username).toBe('updated')
    expect(root.user?.username).toBe('alice')
    expect(admin.organisationsQueryKey()).toEqual(before)
    admin.updateUserPreferences({
      ...admin.getUserPreferences(),
      admin: { isPrimaryPanelCollapsed: true },
    })
    expect(app.view.getUserPreferences().admin?.isPrimaryPanelCollapsed).toBe(true)
    expect(root.user?.preferences).toEqual({})
    expect('map' in admin).toBe(false)
    expect('markerElements' in admin).toBe(false)
    expect('mapController' in admin).toBe(false)
    app.dispose()
    admin.dispose()
  })

  it('invalidates each surface when the root changes before their synchronization runs', () => {
    const root = new RootCTX(new ResponsiveCtx())
    root.sync(
      { id: 'alice', roles: [], superAdmin: false } as unknown as SessionUser,
      null,
    )
    const app = new AppCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    const admin = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    const revision = root.account.revision
    app.view.queries.rows.project = [{ id: 'private-project' }] as never
    admin.queries.rows.project = [{ id: 'private-project' }] as never
    root.sync(
      { id: 'bob', roles: [], superAdmin: false } as unknown as SessionUser,
      null,
    )
    expect(app.view.applyUserProfile({ attribution: 'Old save' }, revision)).toBe(false)
    app.view.syncAccount()
    admin.syncAccount()
    expect(app.view.queries.rows.project).toEqual([])
    expect(admin.queries.rows.project).toEqual([])
    app.dispose()
    admin.dispose()
  })

  it('initialises an admin view without starting public resource or map traversal', async () => {
    const root = new RootCTX({} as ResponsiveCtx)
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    const admin = new AdminCtx(view)
    await view.init(null)
    await admin.init()
    expect(admin.isInitialised).toBe(true)
    expect(view.isAdmin()).toBe(true)
    expect(Object.keys(view.resources.lists)).toEqual([])
    expect(Object.keys(view.resources.featureQueries)).toEqual([])
    view.dispose()
  })

  it('keeps admin queries, filters and raw records independent from the public application', () => {
    const root = new RootCTX({} as ResponsiveCtx)
    const app = new AppCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    const publicQuery = app.view.queries.queryMap.get(FirstClassResource.project)
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    new AdminCtx(view)
    view.scope.prisms.project = ['private-project']
    view.cache.project.set('private-project', { id: 'private-project' } as never)
    expect(app.view.queries.queryMap.get(FirstClassResource.project)).toBe(publicQuery)
    expect(app.view.scope.prisms.project).toEqual([])
    expect(app.view.cache.project.has('private-project')).toBe(false)
    expect(app.view.cacheCtx).toBe(view.cacheCtx)
    app.dispose()
    view.dispose()
  })

  it('clears view projections when super-admin status changes on the same account', async () => {
    const root = new RootCTX({} as ResponsiveCtx)
    const user = { id: 'user', roles: [], superAdmin: true } as unknown as SessionUser
    root.sync(user, null)
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    view.queries.rows.project = [{ id: 'private-project' }] as never
    const nextUser = { ...user, superAdmin: false } as SessionUser
    root.sync(nextUser, null)
    view.syncAccount()
    expect(view.queries.rows.project).toEqual([])
    view.dispose()
  })

  it('releases a surface without clearing another surface or root retention', () => {
    const root = new RootCTX({} as ResponsiveCtx)
    const user = { id: 'user', roles: [] } as unknown as SessionUser
    root.sync(user, null)
    const app = new AppCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
    )
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    view.cache.project.set('project', { id: 'project' } as never)
    const epoch = root.cacheCtx.generation
    app.dispose()
    expect(root.cacheCtx.generation).toBe(epoch)
    expect(view.cache.project.has('project')).toBe(true)
    view.dispose()
  })
})
