import { describe, expect, it } from 'vitest'

import {
  getActiveMapStyleCode,
  getActiveMapStyleIdentity,
} from '#lib/client/services/map.js'
import { ThemeModel } from '#lib/themes/theme.svelte.js'
import { FirstClassResource } from '#lib/enums.js'
import type { AppCtx } from '#lib/context/app.svelte.js'

type MapStyleProject = {
  id: string
  mapStyle?: {
    code?: string | null
  } | null
}

const createAppContext = (params: {
  activeProjectId?: string | null
  selectedProjectIds: string[]
  projects: MapStyleProject[]
  selectedLayerIds?: string[]
  layers?: {
    id: string
    projectId: string
    metadata?: { mapStyleCode?: string | null }
    mapStyleCode?: string | null
  }[]
}): AppCtx =>
  ({
    navigation: {
      getActiveResourceType: () => (params.activeProjectId ? 'project' : false),
      getActiveResourceId: () => params.activeProjectId ?? null,
    },
    view: {
      cache: {
        project: new Map(params.projects.map(row => [row.id, row])),
        layer: new Map((params.layers ?? []).map(row => [row.id, row])),
        feature: new Map(),
      },
      scope: {
        prisms: {
          project: params.selectedProjectIds,
          layer: params.selectedLayerIds ?? [],
        },
      },
      queries: {
        rows: {
          project: [],
          layer: [],
          feature: [],
        },
      },
    },
  }) as unknown as AppCtx

describe('active map style', () => {
  it('switches to the next selected project after the first is removed', () => {
    const projects = [
      { id: 'project-first', mapStyle: { code: 'ghostery' } },
      { id: 'project-remaining', mapStyle: { code: 'rosepunk' } },
    ]

    const beforeRemoval = createAppContext({
      activeProjectId: 'project-first',
      selectedProjectIds: ['project-first', 'project-remaining'],
      projects,
    })
    const afterRemoval = createAppContext({
      // The active resource has not been cleared yet, mirroring the regression.
      activeProjectId: 'project-first',
      selectedProjectIds: ['project-remaining'],
      projects,
    })

    expect(getActiveMapStyleCode(beforeRemoval)).toBe('ghostery')
    expect(getActiveMapStyleCode(afterRemoval)).toBe('rosepunk')
  })
})

// Pinned selections are retained independently of paginated panel query rows.
describe('pinned layer map style', () => {
  it('uses the selected layer project even when neither is on the current list page', () => {
    const context = createAppContext({
      selectedProjectIds: [],
      selectedLayerIds: ['bookshops'],
      layers: [{ id: 'bookshops', projectId: 'books' }],
      projects: [{ id: 'books', mapStyle: { code: 'rosepunk' } }],
    })
    expect(getActiveMapStyleCode(context)).toBe('rosepunk')
  })

  it('resolves the style when the pinned project finishes loading', () => {
    const context = createAppContext({
      selectedProjectIds: [],
      selectedLayerIds: ['bookshops'],
      layers: [{ id: 'bookshops', projectId: 'books' }],
      projects: [],
    })
    expect(getActiveMapStyleCode(context)).toBeNull()
    const loaded = createAppContext({
      selectedProjectIds: [],
      projects: [{ id: 'books', mapStyle: { code: 'rosepunk' } }],
    }).view.cache.project.get('books')
    if (!loaded) throw new Error('Missing project fixture')
    context.view.cache.project.set('books', loaded)
    expect(getActiveMapStyleCode(context)).toBe('rosepunk')
  })

  it('follows the remaining selected layer instead of a stale active project', () => {
    const context = createAppContext({
      activeProjectId: 'old',
      selectedProjectIds: [],
      selectedLayerIds: ['bookshops'],
      layers: [{ id: 'bookshops', projectId: 'books' }],
      projects: [
        { id: 'old', mapStyle: { code: 'ghostery' } },
        { id: 'books', mapStyle: { code: 'rosepunk' } },
      ],
    })
    expect(getActiveMapStyleCode(context)).toBe('rosepunk')
    context.view.scope.prisms.layer = []
    expect(getActiveMapStyleCode(context)).toBe('ghostery')
  })
})

describe('layer map style preference', () => {
  it.each([
    [{ mapStyleCode: 'neorange' }, 'neorange'],
    [{ mapStyleCode: null }, null],
    [{}, 'ghostery'],
  ] as const)(
    'resolves explicit style, User Preference or project inheritance: %j',
    (metadata, expected) => {
      const context = createAppContext({
        selectedProjectIds: ['project'],
        selectedLayerIds: ['layer'],
        projects: [{ id: 'project', mapStyle: { code: 'ghostery' } }],
        layers: [{ id: 'layer', projectId: 'project', metadata }],
      })
      expect(getActiveMapStyleCode(context)).toBe(expected)
    },
  )
})

it('honours User Preference from the public layer profile even when a project style is selected', () => {
  const context = createAppContext({
    selectedProjectIds: ['project'],
    selectedLayerIds: ['layer'],
    projects: [{ id: 'project', mapStyle: { code: 'ghostery' } }],
    layers: [{ id: 'layer', projectId: 'project', mapStyleCode: null }],
  })
  expect(getActiveMapStyleCode(context)).toBeNull()
})

it('keeps basemap ownership on the top layer through marker navigation and changes it on reorder', () => {
  const context = createAppContext({
    selectedProjectIds: [],
    selectedLayerIds: ['signs', 'books'],
    projects: [
      { id: 'signs-project', mapStyle: { code: 'ghostery' } },
      { id: 'books-project', mapStyle: { code: 'rosepunk' } },
    ],
    layers: [
      { id: 'signs', projectId: 'signs-project' },
      { id: 'books', projectId: 'books-project' },
    ],
  })
  const identity = getActiveMapStyleIdentity(context)
  const theme = new ThemeModel()
  theme.updateActiveMapContext(identity, getActiveMapStyleCode(context))
  expect(theme.resolvedMapStyle).toBe('ghostery')
  // A later UI palette selection must also survive clicks on either layer's markers.
  theme.setMapSync(true)
  theme.select('hype-light')
  context.navigation.getActiveResourceType = () => FirstClassResource.feature
  for (const featureId of ['books-marker', 'signs-marker']) {
    context.navigation.getActiveResourceId = () => featureId
    expect(getActiveMapStyleCode(context)).toBe('ghostery')
    expect(getActiveMapStyleIdentity(context)).toBe(identity)
    theme.updateActiveMapContext(
      getActiveMapStyleIdentity(context),
      getActiveMapStyleCode(context),
    )
    expect(theme.resolvedMapStyle).toBe('hype-light')
  }
  context.view.scope.prisms.layer = ['books', 'signs']
  expect(getActiveMapStyleCode(context)).toBe('rosepunk')
  theme.updateActiveMapContext(
    getActiveMapStyleIdentity(context),
    getActiveMapStyleCode(context),
  )
  expect(theme.resolvedMapStyle).toBe('rosepunk')
})

it('never derives a basemap from a feature when no layers are active', () => {
  const context = createAppContext({
    selectedProjectIds: [],
    projects: [{ id: 'books', mapStyle: { code: 'rosepunk' } }],
    layers: [{ id: 'bookshops', projectId: 'books' }],
  })
  context.navigation.getActiveResourceType = () => FirstClassResource.feature
  context.navigation.getActiveResourceId = () => 'marker'
  context.view.cache.feature.set('marker', {
    id: 'marker',
    layerId: 'bookshops',
    projectId: 'books',
  } as never)
  expect(getActiveMapStyleCode(context)).toBeNull()
})
