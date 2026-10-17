// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
import { SvelteMap } from 'svelte/reactivity'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import Fixture from './fixtures/components/FilterPanelModelFixture.svelte'
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'

vi.mock('#lib/i18n.js', () => ({
  getI18n: (record: { key: string }) => record.key,
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
    getContextualOrganisationName: () => 'Ghost Signs',
    getContextualProjectName: () => 'Ghost Signs',
    getContextualLayerName: () => 'All',
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
