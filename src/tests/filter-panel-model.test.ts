// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { SvelteMap } from 'svelte/reactivity'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import Fixture from './fixtures/components/FilterPanelModelFixture.svelte'
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'

vi.mock('#lib/i18n.js', () => ({
  getI18n: (record: { key?: string; name?: string }, field: string) =>
    field === 'name' ? record.name : record.key,
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
afterEach(cleanup)

it('hydrates categories after definitions arrive and updates them without a layer toggle', async () => {
  vi.useRealTimers()
  const property = {
    id: 'material',
    key: 'material',
    type: 'classifier',
    rank: 0,
  } as Property
  const cache = new SvelteMap<string, Property>()
  const layer = {
    id: 'ghosts',
    properties: [{ propertyId: property.id, isVisible: true }],
  }
  const app = {
    cache: { property: cache },
    scope: { getPrism: () => ['ghosts'] },
    getLayerById: vi.fn(async () => layer),
    getHierarchy: async () => ({ project: {}, organisation: {} }),
    getContextualOrganisationName: vi.fn((_record, hideIfOnly = true) =>
      hideIfOnly ? null : 'Ghost Signs',
    ),
    getContextualProjectName: vi.fn((_record, hideIfOnly = true) =>
      hideIfOnly ? null : 'Sign Archive',
    ),
    getContextualLayerName: vi.fn((_record, hideIfOnly = true) =>
      hideIfOnly ? null : 'Current',
    ),
    getUserPreferences: () => ({}),
    getClassifierPropertiesForLayer: async () => [...cache.values()],
    filters: { values: { feature: { properties: {} } } },
  } as unknown as ResourceViewCtx
  let model!: ReturnType<typeof useFilterPanelModel>
  render(Fixture, {
    app,
    onModel: value => {
      model = value
    },
  })
  await waitFor(() => expect(app.getLayerById).toHaveBeenCalled())
  expect(model.categories).toEqual([])
  cache.set(property.id, property)
  await waitFor(() => expect(model.categories[0]?.properties[0]?.key).toBe('material'))
  expect(model.categories[0]?.selectedSummary).toBe('')
  // Single-child projects and layers must still identify their filter group.
  expect(model.categories[0]?.hierarchy).toEqual({
    organisation: null,
    project: 'Sign Archive',
    layer: 'Current',
    layerId: 'ghosts',
  })
  cache.set(property.id, { ...property, key: 'updated' })
  await waitFor(() => expect(model.categories[0]?.properties[0]?.key).toBe('updated'))
  cache.clear()
  await waitFor(() => expect(model.categories).toEqual([]))

  // A slower earlier hydration must not overwrite the latest definitions.
  let resolveOlder!: (properties: Property[]) => void
  const older = new Promise<Property[]>(resolve => {
    resolveOlder = resolve
  })
  const classifier = vi
    .spyOn(app, 'getClassifierPropertiesForLayer')
    .mockImplementationOnce(() => older)
  cache.set(property.id, property)
  await waitFor(() => expect(classifier).toHaveBeenCalledTimes(1))
  cache.set(property.id, { ...property, key: 'latest' })
  await waitFor(() => expect(model.categories[0]?.properties[0]?.key).toBe('latest'))
  resolveOlder([property])
  await older
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(model.categories[0]?.properties[0]?.key).toBe('latest')
})

it('uses full project names and only qualifies distinct projects with matching names', async () => {
  const { getGroupedClassifierProperties } = await import(
    '#lib/client/services/property.js'
  )
  const layers = [
    { id: 'a', projectId: 'one' },
    { id: 'b', projectId: 'one' },
    { id: 'c', projectId: 'two' },
  ]
  const projects = new Map([
    ['one', { id: 'one', name: 'Ghost Signs' }],
    ['two', { id: 'two', name: 'Neon Signs' }],
  ])
  const app = {
    scope: { getPrism: () => layers.map(layer => layer.id) },
    getLayerById: async (id: string) => layers.find(layer => layer.id === id),
    getHierarchy: async (layer: (typeof layers)[number]) => ({
      project: projects.get(layer.projectId),
      organisation: { id: layer.projectId },
    }),
    getClassifierPropertiesForLayer: async () => [{ id: 'material' }],
    getUserPreferences: () => ({}),
    getContextualOrganisationName: (record: { id: string }) => record.id,
    getContextualProjectName: () => 'All',
    getContextualLayerName: (record: { id: string }) => record.id,
  } as unknown as ResourceViewCtx
  const unique = await getGroupedClassifierProperties(app)
  expect(unique.map(group => group.hierarchy.project)).toEqual([
    'Ghost Signs',
    'Ghost Signs',
    'Neon Signs',
  ])
  expect(unique.map(group => group.hierarchy.organisation)).toEqual([null, null, null])
  projects.set('two', { id: 'two', name: 'Ghost Signs' })
  const duplicate = await getGroupedClassifierProperties(app)
  expect(duplicate.map(group => group.hierarchy.organisation)).toEqual([
    'one',
    'one',
    'two',
  ])
})

it('includes public temporal specifiers and uses their service-day domain and formatted selection', async () => {
  vi.useRealTimers()
  const hours = {
    id: 'hours',
    key: 'hours',
    type: 'specifier',
    dataType: 'timeRange',
    timeMaxHour: 36,
    audience: 'public',
    rank: 0,
  } as Property
  const privateHours = {
    ...hours,
    id: 'private-hours',
    audience: 'internal',
  } as Property
  const cache = new SvelteMap<string, Property>([
    [hours.id, hours],
    [privateHours.id, privateHours],
  ])
  const layer = {
    id: 'events',
    properties: [
      { propertyId: hours.id, isVisible: true },
      { propertyId: privateHours.id, isVisible: true },
    ],
  }
  const app = {
    cache: { property: cache },
    scope: { getPrism: () => ['events'] },
    getLayerById: async () => layer,
    getHierarchy: async () => ({ project: {}, organisation: {} }),
    getContextualOrganisationName: () => '',
    getContextualProjectName: () => '',
    getContextualLayerName: () => '',
    getUserPreferences: () => ({}),
    getClassifierPropertiesForLayer: async () => [],
    filters: { values: { feature: { properties: {} } } },
  } as unknown as ResourceViewCtx
  let model!: ReturnType<typeof useFilterPanelModel>
  render(Fixture, { app, onModel: value => (model = value) })
  await waitFor(() =>
    expect(model.categories[0]?.properties.map(row => row.id)).toEqual(['hours']),
  )
  const filter = model.propertyFilter(hours, 'events')
  expect(filter.rangeValues).toEqual([0, 2160])
  filter.setRange([1440, 1530])
  expect(filter.displayText).toBe('24:00 – 25:30')
  expect(filter.rangeValues).toEqual([1440, 1530])
  expect(app.filters.values.feature.properties).toEqual({
    events: {
      hours: { globalMin: 0, globalMax: 2160, rangeMin: 1440, rangeMax: 1530 },
    },
  })
})
