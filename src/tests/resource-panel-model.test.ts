// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import { SurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
import Fixture from './fixtures/components/ResourcePanelModelFixture.svelte'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'

const route = vi.hoisted(() => ({
  url: new URL('http://localhost/admin/organisations'),
}))
vi.mock('$app/state', () => ({ page: route }))

const messagingQueries = vi.hoisted(() => ({ ids: ['a', 'b', 'c'] }))
vi.mock('#lib/api/messaging.remote.js', () => ({
  getMessagingOrganisations: () =>
    Object.assign(Promise.resolve(messagingQueries.ids.map(id => ({ id, code: id }))), {
      refresh: async () => {},
    }),
}))

const notifications = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast: notifications }))

const navigation = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('#lib/navigation/index.js', () => ({
  navigateOnAdminById: navigation.navigate,
  getSupportedFacetForResource: () => 'settings',
  navigateOnAdmin: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('#lib/i18n.js', () => ({
  getI18n: (record: { name?: string }) => record.name ?? '',
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  route.url = new URL('http://localhost/admin/organisations')
})

/**
 * Builds the real panel adapter and cache merge with controlled navigation and prism state.
 * @param selected - Organisation prism IDs.
 * @param active - Currently open organisation ID.
 * @returns The adapter and observable navigation/prism actions.
 */
function setup(
  selected: string[] = [],
  active = 'b',
  options: {
    mode?: 'admin' | 'prisms'
    viewReady?: boolean
    adminReady?: boolean
    open?: boolean
    layers?: string[]
    organisationMember?: string
    pinError?: () => unknown
    listDenied?: () => boolean
    onPinRefresh?: () => Promise<void>
  } = {},
) {
  const resources = ['a', 'b', 'c'].map(id => ({
    id,
    name: `Organisation ${id}`,
    isArchived: false,
  }))
  messagingQueries.ids = options.organisationMember
    ? [options.organisationMember]
    : ['a', 'b', 'c']
  const toggleOrganisation = vi.fn()
  const selectOrganisation = vi.fn()
  const refreshPin = vi.fn(options.onPinRefresh ?? (async () => {}))
  const list = {
    rows: resources,
    loading: false,
    error: null,
    load: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    revalidate: vi.fn().mockResolvedValue(undefined),
  }
  const app = {
    isInitialised: options.viewReady ?? true,
    panels: {
      isPanelOpen: () => options.open ?? true,
      isPanelNarrow: () => false,
      isPanelOpenVisually: () => false,
    },
    account: {
      user: {
        id: 'operator',
        isAnonymous: false,
        superAdmin: !options.organisationMember,
        roles: options.organisationMember
          ? [
              {
                type: 'organisation',
                role: 'member',
                organisationId: options.organisationMember,
              },
            ]
          : [],
      },
    },
    scope: {
      prisms: { organisation: selected, project: [], layer: options.layers ?? [] },
      moveLayer: vi.fn(),
      // Map defaults deliberately differ from prism selections.
      isOrganisationDefaultLayersActive: () => true,
      isProjectDefaultLayersActive: () => true,
      toggleOrganisation,
      selectOrganisation,
    },
    cacheCtx: {
      retainPin: vi.fn(() => vi.fn()),
      pin: (_type: string, id: string) => ({
        current: resources.find(row => row.id === id) ?? { id, name: id },
        get error() {
          return options.pinError?.()
        },
        refresh: refreshPin,
      }),
    },
    resources: {
      createCollection: (type: string) => ({
        ...list,
        get denied() {
          return options.listDenied?.() ?? false
        },
        rows:
          type === 'organisation' || (type === 'layer' && options.layers)
            ? resources
            : [],
        release: vi.fn(),
      }),
    },
    filters: { panelResourceInput: () => ({ meta: {} }) },
    retainPanelRows: vi.fn(),
    getUserPreferences: () => ({}),
    getHierarchySync: () => ({}),
  } as unknown as ResourceViewCtx
  const routeNavigation = new SurfaceNavigation(() => active)
  routeNavigation.setActiveFacet('core', active, 'organisation' as never)
  let model!: ResourcePanelModel
  render(Fixture, {
    app,
    mode: options.mode,
    admin: {
      navigation: routeNavigation,
      isInitialised: options.adminReady ?? true,
    } as AdminCtx,
    onModel: value => {
      model = value
    },
  })
  return {
    list,
    rows: model.sections[0].rows,
    sections: model.sections,
    app,
    toggleOrganisation,
    selectOrganisation,
    refreshPin,
  }
}

it('presents active layers in basemap priority order and exposes reordering only on the public layer section', () => {
  const { sections, app } = setup([], 'b', { mode: 'prisms', layers: ['c', 'a'] })
  expect(sections[2].rows.map(row => row.id)).toEqual(['c', 'a', 'b'])
  expect(sections[2].reorderIds).toEqual(['c', 'a'])
  sections[2].onMove?.('a', 0)
  expect(app.scope.moveLayer).toHaveBeenCalledWith('a', 0)
  expect(sections[0].onMove).toBeUndefined()
  expect(sections[1].onMove).toBeUndefined()
  expect(setup([], 'b', { layers: ['c', 'a'] }).sections[2].onMove).toBeUndefined()
})

it('keeps navigation-only active rows in page order and their dots unselected', async () => {
  const { rows, toggleOrganisation } = setup()
  expect(rows.map(row => row.id)).toEqual(['a', 'b', 'c'])
  expect(rows.find(row => row.id === 'b')).toMatchObject({
    active: true,
    selected: false,
    enabled: false,
  })
  await rows[2].onPrimary()
  expect(navigation.navigate).toHaveBeenCalledOnce()
  expect(toggleOrganisation).not.toHaveBeenCalled()
  await rows[1].onPrimary()
  expect(toggleOrganisation).toHaveBeenCalledWith('b')
})

it('promotes only prism selections and keeps the direct prism action separate', async () => {
  const { rows, toggleOrganisation } = setup(['c'])
  expect(rows.map(row => row.id)).toEqual(['c', 'a', 'b'])
  expect(rows[0]).toMatchObject({
    selected: true,
    enabled: true,
    active: false,
  })
  await rows[1].onToggle()
  expect(toggleOrganisation).toHaveBeenCalledWith('a')
  expect(navigation.navigate).not.toHaveBeenCalled()
})

it('retains an off-page open resource after the current page without promoting it', () => {
  expect(setup([], 'outside').rows.map(row => row.id)).toEqual([
    'a',
    'b',
    'c',
    'outside',
  ])
})

it('recognises only the matching resource index for compact section toggling', () => {
  const { sections } = setup()
  for (const [path, expected] of [
    ['/admin/organisations', [true, false, false]],
    ['/admin/organisations/?panel=settings', [true, false, false]],
    ['/admin/organisations/hkfoodworks', [false, false, false]],
    ['/admin/projects', [false, true, false]],
    ['/admin/layers', [false, false, true]],
  ] as const) {
    route.url = new URL(path, 'http://localhost')
    expect(sections.map(section => section.isIndexActive)).toEqual(expected)
  }
})

it.each(['onPrimary', 'onToggle'] as const)(
  'handles a rejected %s action without replaying the selection',
  async action => {
    const { rows, toggleOrganisation } = setup()
    const failure = { status: 500, body: { message: 'Internal Error' } }
    toggleOrganisation.mockRejectedValueOnce(failure)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(rows.find(row => row.id === 'b')![action]()).resolves.toBeUndefined()
      expect(toggleOrganisation).toHaveBeenCalledExactlyOnceWith('b')
      expect(notifications.error).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledWith('[Resource panel] Action failed:', failure)
    } finally {
      log.mockRestore()
    }
  },
)

it.each(['/admin/messaging', '/admin/whatsapp/'])(
  'uses one exclusive organisation prism on %s and keeps navigation on the inbox',
  async path => {
    route.url = new URL(path, 'http://localhost')
    const { sections, selectOrganisation, toggleOrganisation } = setup(['c', 'a'])
    await vi.waitFor(() => expect(sections[0].rows).toHaveLength(3))
    const rows = sections[0].rows
    expect(sections.map(section => section.id)).toEqual(['organisation'])
    expect(sections[0].onNavigate).toBeUndefined()
    expect(rows.every(row => row.exclusive)).toBe(true)
    expect(rows.find(row => row.id === 'c')).toMatchObject({
      selected: true,
      active: true,
    })
    await rows.find(row => row.id === 'b')!.onPrimary()
    await rows.find(row => row.id === 'a')!.onToggle()
    expect(selectOrganisation.mock.calls).toEqual([['b'], ['a']])
    expect(toggleOrganisation).not.toHaveBeenCalled()
    expect(navigation.navigate).not.toHaveBeenCalled()
  },
)

it('uses server-authorised IDs even when compact rows omit hub ownership', async () => {
  route.url = new URL('http://localhost/admin/messaging')
  const { sections } = setup([], 'b', { organisationMember: 'b' })
  await vi.waitFor(() => expect(sections[0].rows.map(row => row.id)).toEqual(['b']))
})

it('releases every panel selection owner on teardown', async () => {
  const { flushSync } = await import('svelte')
  const { app } = setup(['c'])
  flushSync()
  const retain = vi.mocked(app.cacheCtx.retainPin)
  expect(retain.mock.calls.map(([, id]) => id).sort()).toEqual(['b', 'c'])
  const releases = retain.mock.results.map(result => result.value)
  for (const release of releases) expect(release).not.toHaveBeenCalled()
  cleanup()
  for (const release of releases) expect(release).toHaveBeenCalledOnce()
})

it.each([401, 403, 404])(
  'hides denied pin data on status %s, including overlapping page rows',
  async status => {
    const { flushSync } = await import('svelte')
    const { detailQueryProbe } = await import(
      './fixtures/resourceDetailHarness.svelte.js'
    )
    const native = detailQueryProbe(null)
    const { sections } = setup(['c'], 'outside', { pinError: () => native.query.error })
    flushSync()
    expect(sections[0].rows.map(row => row.id)).toEqual(['c', 'a', 'b', 'outside'])
    native.setError(status)
    flushSync()
    expect(sections[0].rows.map(row => row.id)).toEqual(['a', 'b'])
    native.setError()
    flushSync()
    expect(sections[0].rows.map(row => row.id)).toEqual(['c', 'a', 'b', 'outside'])
  },
)

it('keeps pin previews on transient refresh failures', async () => {
  const { flushSync } = await import('svelte')
  const { detailQueryProbe } = await import(
    './fixtures/resourceDetailHarness.svelte.js'
  )
  const native = detailQueryProbe(null)
  const { sections } = setup([], 'outside', { pinError: () => native.query.error })
  native.setError(503)
  flushSync()
  expect(sections[0].rows.map(row => row.id)).toEqual(['a', 'b', 'c', 'outside'])
})

it('does not restore old pins when the collection loses access', async () => {
  const { flushSync } = await import('svelte')
  const { detailQueryProbe } = await import(
    './fixtures/resourceDetailHarness.svelte.js'
  )
  const native = detailQueryProbe(null)
  const { sections } = setup(['c'], 'outside', {
    listDenied: () => Boolean(native.query.error),
  })
  flushSync()
  expect(sections[0].rows).toHaveLength(4)
  native.setError(403)
  flushSync()
  expect(sections[0].rows).toEqual([])
  native.setError()
  flushSync()
  expect(sections[0].rows).toHaveLength(4)
})

it.each(['retry', 'focus', 'visibility'] as const)(
  'refreshes off-page selections on %s',
  async trigger => {
    const { flushSync } = await import('svelte')
    const { detailQueryProbe } = await import(
      './fixtures/resourceDetailHarness.svelte.js'
    )
    const native = detailQueryProbe(null)
    const { sections, refreshPin } = setup([], 'outside', {
      pinError: () => native.query.error,
      onPinRefresh: async () => {
        native.setError()
      },
    })
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible')
    try {
      native.setError(403)
      flushSync()
      expect(sections[0].rows.map(row => row.id)).not.toContain('outside')
      expect(sections[0].error).toBe(true)
      if (trigger === 'retry') sections[0].onRetry()
      else if (trigger === 'focus') window.dispatchEvent(new Event('focus'))
      else document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(refreshPin).toHaveBeenCalledOnce())
      flushSync()
      expect(sections[0].rows.map(row => row.id)).toContain('outside')
      expect(sections[0].error).toBe(false)
    } finally {
      visibility.mockRestore()
    }
  },
)

it('skips focus refreshes while hidden and removes listeners on teardown', async () => {
  const { flushSync } = await import('svelte')
  const { refreshPin } = setup([], 'outside')
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden')
  try {
    flushSync()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refreshPin).not.toHaveBeenCalled()
    cleanup()
    visibility.mockReturnValue('visible')
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refreshPin).not.toHaveBeenCalled()
  } finally {
    visibility.mockRestore()
  }
})

it('handles rejected pin refreshes without dropping transient previews', async () => {
  const { flushSync } = await import('svelte')
  const { detailQueryProbe } = await import(
    './fixtures/resourceDetailHarness.svelte.js'
  )
  const native = detailQueryProbe(null)
  const { sections, refreshPin } = setup([], 'outside', {
    pinError: () => native.query.error,
    onPinRefresh: async () => {
      native.setError(503)
      throw { status: 503 }
    },
  })
  flushSync()
  sections[0].onRetry()
  await vi.waitFor(() => expect(refreshPin).toHaveBeenCalledOnce())
  flushSync()
  expect(sections[0].rows.map(row => row.id)).toContain('outside')
})

it('does not load or refresh a closed public resource panel on window focus', async () => {
  const { list } = setup([], 'b', { mode: 'prisms', open: false })
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(250)
  expect(list.load).not.toHaveBeenCalled()
  expect(list.revalidate).not.toHaveBeenCalled()
})

it.each([
  [false, false],
  [true, false],
  [false, true],
])(
  'does not start admin sidebar requests before view=%s and admin=%s are both ready',
  async (viewReady, adminReady) => {
    const { list, app, refreshPin, sections } = setup([], 'outside', {
      viewReady,
      adminReady,
    })
    sections[0].onRetry()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(250)
    expect(list.load).not.toHaveBeenCalled()
    expect(list.revalidate).not.toHaveBeenCalled()
    expect(app.cacheCtx.retainPin).not.toHaveBeenCalled()
    expect(refreshPin).not.toHaveBeenCalled()
  },
)

it('loads the authenticated admin sidebar after initialization', async () => {
  const { list, app } = setup([], 'outside', { viewReady: true, adminReady: true })
  await vi.advanceTimersByTimeAsync(250)
  expect(list.load).toHaveBeenCalled()
  expect(app.cacheCtx.retainPin).toHaveBeenCalled()
})
