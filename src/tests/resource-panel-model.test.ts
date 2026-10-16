// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/ResourcePanelModelFixture.svelte'
import type { AppCtx } from '#lib/context/app.svelte'
import type { AdminCtx } from '#lib/context/admin.svelte'
import type { ResourcePanelModel } from '#lib/bits/patterns/resourcePanel/resourcePanel.types'

const route = vi.hoisted(() => ({
  url: new URL('http://localhost/admin/organisations'),
}))
vi.mock('$app/state', () => ({ page: route }))

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
})

/**
 * Builds the real panel adapter and cache merge with controlled navigation and prism state.
 * @param selected - Organisation prism IDs.
 * @param active - Currently open organisation ID.
 * @returns The adapter and observable navigation/prism actions.
 */
function setup(selected: string[] = [], active = 'b') {
  const resources = ['a', 'b', 'c'].map(id => ({ id, name: `Organisation ${id}` }))
  const toggleOrganisation = vi.fn()
  const list = {
    rows: resources,
    loading: false,
    error: null,
    load: vi.fn(),
    next: vi.fn(),
    revalidate: vi.fn(),
  }
  const app = {
    state: { prisms: { organisation: selected, project: [], layer: [] } },
    cacheCtx: {
      lists: {
        organisation: list,
        project: { ...list, rows: [] },
        layer: { ...list, rows: [] },
      },
      pin: (_type: string, id: string) => ({
        current: resources.find(row => row.id === id) ?? { id, name: id },
      }),
    },
    panelResourceInput: () => ({ meta: {} }),
    retainPanelRows: vi.fn(),
    getActiveResourceId: () => active,
    getActiveResourceType: () => 'organisation',
    getActiveFacet: () => 'settings',
    getUserPreferences: () => ({}),
    getHierarchySync: () => ({}),
    // Map defaults deliberately differ from prism selections.
    isOrganisationDefaultLayersActive: () => true,
    isProjectDefaultLayersActive: () => true,
    toggleOrganisation,
  } as unknown as AppCtx
  let model!: ResourcePanelModel
  render(Fixture, {
    app,
    admin: {} as AdminCtx,
    onModel: value => {
      model = value
    },
  })
  return { rows: model.sections[0].rows, sections: model.sections, toggleOrganisation }
}

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
  expect(rows[0]).toMatchObject({ selected: true, enabled: true, active: false })
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
