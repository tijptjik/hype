// TESTING
import { describe, expect, it } from 'vitest'
import { createFeatureQueryEffectRoot } from './fixtures/featureQueryHarness.svelte'
// ADAPTER
import { useDefaultMapSettingsModel } from '#lib/adapters/panels/useDefaultMapSettingsModel.svelte.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

describe('default map settings choices', () => {
  it('labels compact projects and only qualifies names shared by distinct projects', () => {
    const dispose = createFeatureQueryEffectRoot(() => {
      const projects = [
        {
          id: 'signs',
          i18n: { en: { name: 'HK Ghost Signs', nameShort: 'Ghost Signs' } },
          useAllInOrgContext: true,
        },
        {
          id: 'books',
          i18n: { en: { name: 'Independent bookshops', nameShort: 'Bookshops' } },
        },
        {
          id: 'other-books',
          i18n: { en: { name: 'Other bookshops', nameShort: ' bookshops ' } },
        },
      ]
      const app = {
        account: { revision: 0 },
        scope: {
          getUserLayersForCurrentHub: () => [],
          selectionLayers: [
            { id: 'current', projectId: 'signs' },
            { id: 'dismantled', projectId: 'signs' },
            { id: 'bookshops', projectId: 'books' },
            { id: 'other-bookshops', projectId: 'other-books' },
          ],
        },
        getUserPreferences: () => ({}),
        getHierarchySync: (layer: { projectId: string }) => ({
          project: projects.find(project => project.id === layer.projectId),
        }),
      } as unknown as ResourceViewCtx
      const model = useDefaultMapSettingsModel(app)
      const [signs, books, otherBooks] = projects as unknown as Parameters<
        typeof model.getProjectName
      >[0][]

      expect(model.getProjectName(signs)).toBe('Ghost Signs')
      expect(model.getProjectName(books)).toBe('Bookshops')
      expect(model.shouldShowOrganisation(signs)).toBe(false)
      expect(model.getProjectLabel(signs, false)).toBe('Ghost Signs')
      expect(model.getProjectLabel(signs, true)).toBe('All')
      expect(model.shouldShowOrganisation(books)).toBe(true)
      expect(model.shouldShowOrganisation(otherBooks)).toBe(true)
      expect(model.shouldShowOrganisation(undefined)).toBe(false)
    })
    dispose()
  })

  it('groups layers by displayed project name and then sorts layer names, ignoring rank', () => {
    const dispose = createFeatureQueryEffectRoot(() => {
      const app = {
        account: { revision: 0 },
        scope: {
          getUserLayersForCurrentHub: () => [],
          selectionLayers: [
            {
              id: 'zulu-current',
              projectId: 'zulu',
              rank: 0,
              i18n: { en: { name: 'Current' } },
            },
            {
              id: 'alpha-z',
              projectId: 'alpha',
              rank: 1,
              i18n: { en: { name: 'Zebra' } },
            },
            {
              id: 'zulu-archived',
              projectId: 'zulu',
              rank: 2,
              i18n: { en: { name: 'Archived' } },
            },
            {
              id: 'alpha-a',
              projectId: 'alpha',
              rank: 3,
              i18n: { en: { name: 'Apple' } },
            },
          ],
        },
        getUserPreferences: () => ({}),
        getHierarchySync: (layer: { projectId: string }) => ({
          project: { id: layer.projectId, i18n: { en: { name: layer.projectId } } },
        }),
      } as unknown as ResourceViewCtx
      const model = useDefaultMapSettingsModel(app)
      expect(model.orderedLayers.map(layer => layer.id)).toEqual([
        'alpha-a',
        'alpha-z',
        'zulu-archived',
        'zulu-current',
      ])
    })
    dispose()
  })

  it('keeps the complete selection independent of an empty or filtered panel page', () => {
    const dispose = createFeatureQueryEffectRoot(() => {
      const app = {
        account: { revision: 0 },
        scope: {
          getUserLayersForCurrentHub: () => [{ layerId: 'outside-page' }],
          selectionLayers: [
            {
              id: 'outside-page',
              projectId: 'project',
              rank: 1,
              i18n: { en: { name: 'Outside page' } },
            },
            {
              id: 'first',
              projectId: 'project',
              rank: 0,
              i18n: { en: { name: 'First' } },
            },
          ],
        },
        getHierarchySync: () => ({}),
        state: { resources: { layer: [] } },
        getUserPreferences: () => ({}),
        hub: { code: 'core' },
      } as unknown as ResourceViewCtx
      const model = useDefaultMapSettingsModel(app)
      expect(model.orderedLayers.map(layer => layer.id)).toEqual([
        'first',
        'outside-page',
      ])
      expect(model.userLayerIds.has('outside-page')).toBe(true)
    })
    dispose()
  })
})
