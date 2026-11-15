// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/OmnibarModelFixture.svelte'
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { useOmnibarModel } from '#lib/adapters/bars/useOmnibarModel.svelte.js'

vi.mock('#lib/client/services/feature.js', () => ({ initAddNewFeature: vi.fn() }))
vi.mock('#lib/navigation/index.js', () => ({
  dismissActiveFeatureNavigation: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('#lib/i18n.js', () => ({
  getI18n: (
    row: { i18n: Record<string, { name: string }> },
    _field: string,
    preferences?: { contentLocale?: string },
  ) => row.i18n[preferences?.contentLocale ?? 'en']?.name ?? row.i18n.en.name,
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
vi.mock('#lib/context/panel-resources.svelte.js', () => ({
  usePanelResources: (_: unknown, type: string) => ({
    list: { loading: false },
    rows: [
      { id: 'unrelated', i18n: { en: { name: 'Other' } } },
      ...[0, 1, 2].map(index => ({
        id: `${type}-${index}`,
        i18n: { en: { name: `Neon ${index}` } },
      })),
    ],
  }),
}))
afterEach(cleanup)

function setup() {
  vi.useRealTimers()
  const scope = {
    prisms: {
      layer: [] as string[],
      project: [] as string[],
      organisation: [] as string[],
    },
    isProjectDefaultLayersActive: () => false,
    isOrganisationDefaultLayersActive: () => false,
    toggleLayer: vi.fn(),
    isolateLayer: vi.fn(),
    activateProjectWithDefaultLayers: vi.fn(),
    activateOrganisationWithDefaultLayers: vi.fn(),
    toggleProject: vi.fn(),
    toggleOrganisation: vi.fn(),
  }
  const app = {
    getActiveCollection: () => null,
    getActiveFeature: () => null,
    view: {
      scope,
      getUserPreferences: () => ({}),
      layout: { getEffectiveAppMainWidth: () => 390, getAppMainOffsetX: () => 0 },
      resources: { featureQueries: { search: {}, collection: {} } },
    },
  } as unknown as AppCtx
  const featureSelect = vi.fn()
  const omni = {
    closeTray: vi.fn(),
    searchQueryTerm: 'neon',
    state: { searchTerm: 'neon', isTrayOpen: true, mode: 'search' },
    searchResults: {
      feature: [
        { ref: 'feature', name: 'Neon feature', count: 1, collectionType: 'feature' },
      ],
      neighbourhood: [],
      walk: [],
    },
    limits: { feature: 5 },
    searchFeatureLimit: 5,
    searchHandlers: { feature: featureSelect },
  } as unknown as OmniCtx
  let model!: ReturnType<typeof useOmnibarModel>
  render(Fixture, {
    app,
    omni,
    onModel: value => {
      model = value
    },
  })
  return {
    app,
    scope,
    omni,
    featureSelect,
    search: () => model.getOmnibarProps().search,
  }
}

it('orders all categories by policy and excludes nonmatching pins', () => {
  const { search, featureSelect } = setup()
  const sections = search().sections
  expect(sections.map(section => section.collectionType)).toEqual([
    'station',
    'mall',
    'feature',
    'walk',
    'project',
    'layer',
    'neighbourhood',
    'organisation',
  ])
  for (const section of sections.filter(section =>
    ['project', 'layer', 'organisation'].includes(section.collectionType),
  )) {
    expect(section.limit).toBe(2)
    expect(section.results.map(row => row.ref)).toEqual([
      `${section.collectionType}-0`,
      `${section.collectionType}-1`,
      `${section.collectionType}-2`,
    ])
  }
  expect(search().viewport).toEqual({ height: 700, offsetTop: 0 })
  search().onSelectFirstResult()
  expect(featureSelect).toHaveBeenCalledWith('feature')
})

it('uses normal activation for rows and independent isolate/prism actions for controls', async () => {
  const { search, scope } = setup()
  const sections = search().sections
  for (const section of sections.filter(section =>
    ['project', 'layer', 'organisation'].includes(section.collectionType),
  )) {
    section.onSelection(section.results[0].ref)
    section.results[0].control?.onClick()
  }
  await Promise.resolve()
  expect(scope.toggleLayer).toHaveBeenCalledExactlyOnceWith('layer-0')
  expect(scope.isolateLayer).toHaveBeenCalledExactlyOnceWith('layer-0')
  expect(scope.activateProjectWithDefaultLayers).toHaveBeenCalledExactlyOnceWith(
    'project-0',
  )
  expect(scope.toggleProject).toHaveBeenCalledExactlyOnceWith('project-0')
  expect(scope.activateOrganisationWithDefaultLayers).toHaveBeenCalledExactlyOnceWith(
    'organisation-0',
  )
  expect(scope.toggleOrganisation).toHaveBeenCalledExactlyOnceWith('organisation-0')
})

it('selects the first project when no feature or walk matches and omits resource groups for blank searches', () => {
  const { search, omni, scope } = setup()
  omni.searchResults.feature = []
  search().onSelectFirstResult()
  expect(scope.activateProjectWithDefaultLayers).toHaveBeenCalledWith('project-0')
  omni.state.searchTerm = ' '
  omni.searchQueryTerm = ' '
  expect(search().sections.map(section => section.collectionType)).toEqual([
    'station',
    'mall',
    'feature',
    'walk',
    'neighbourhood',
  ])
})

it('does not activate an incoming match with Enter while the displayed results are retained', () => {
  const { search, omni, featureSelect } = setup()
  Object.defineProperty(omni, 'searchPending', { value: true, configurable: true })
  search().onSelectFirstResult()
  expect(featureSelect).not.toHaveBeenCalled()
  Object.defineProperty(omni, 'searchPending', { value: false })
  search().onSelectFirstResult()
  expect(featureSelect).toHaveBeenCalledWith('feature')
})

it('keeps completed matches while the draft advances and shows activity immediately', () => {
  const { search, omni } = setup()
  const completed = search()
    .sections.find(section => section.collectionType === 'layer')
    ?.results.map(row => row.ref)
  omni.state.searchTerm = 'neon signs'
  expect(search().updating).toBe(true)
  expect(
    search()
      .sections.find(section => section.collectionType === 'layer')
      ?.results.map(row => row.ref),
  ).toEqual(completed)
  omni.state.searchTerm = 'neon'
  expect(search().updating).toBe(false)
})

it.each(['project', 'layer', 'organisation'] as const)(
  'closes search after activating a %s without toggling an active result off',
  async type => {
    const { search, scope, omni } = setup()
    const section = search().sections.find(section => section.collectionType === type)!
    section.onSelection(`${type}-0`)
    await Promise.resolve()
    await waitFor(() => expect(omni.closeTray).toHaveBeenCalledTimes(1))
    scope.prisms.layer = ['layer-0']
    scope.isProjectDefaultLayersActive = () => true
    scope.isOrganisationDefaultLayersActive = () => true
    section.onSelection(`${type}-0`)
    await Promise.resolve()
    await waitFor(() => expect(omni.closeTray).toHaveBeenCalledTimes(2))
    const activate =
      type === 'layer'
        ? scope.toggleLayer
        : type === 'project'
          ? scope.activateProjectWithDefaultLayers
          : scope.activateOrganisationWithDefaultLayers
    expect(activate).toHaveBeenCalledTimes(1)
  },
)

it('keeps search open when activation fails or an independent control is used', async () => {
  const { search, scope, omni } = setup()
  const section = search().sections.find(
    section => section.collectionType === 'project',
  )!
  section.results[0].control?.onClick()
  await Promise.resolve()
  expect(omni.closeTray).not.toHaveBeenCalled()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  scope.activateProjectWithDefaultLayers.mockRejectedValueOnce(new Error('failed'))
  section.onSelection('project-0')
  await Promise.resolve()
  await waitFor(() => expect(log).toHaveBeenCalled())
  expect(omni.closeTray).not.toHaveBeenCalled()
  log.mockRestore()
})

it.each([
  ['en', 'Admiralty'],
  ['zhHant', '金鐘'],
  ['zhHans', '金钟'],
])('shows only the %s station name in omnibar results', (locale, name) => {
  const { app, omni, search } = setup()
  Object.defineProperty(app, 'showMtrStations', { value: true })
  app.view.getUserPreferences = () =>
    ({ contentLocale: locale }) as ReturnType<AppCtx['view']['getUserPreferences']>
  omni.state.searchTerm = 'ADM'
  const station = search().sections.find(
    section => section.collectionType === 'station',
  )
  expect(station?.results).toHaveLength(1)
  expect(station?.results[0].name).toBe(`${name} · ADM`)
})
