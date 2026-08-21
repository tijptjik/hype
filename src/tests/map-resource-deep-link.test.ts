import { describe, expect, it } from 'vitest'
// SERVICES
import { getMapResourceDeepLinkLayerIds } from '$lib/client/services/mapResourceDeepLink'

describe('map resource deep links', () => {
  const projects = [
    { id: 'neon-project', code: 'neon' },
    { id: 'parks-project', code: 'parks' },
  ]
  const layers = [
    { id: 'neon-signs', projectId: 'neon-project' },
    { id: 'neon-art', projectId: 'neon-project' },
    { id: 'parks', projectId: 'parks-project' },
  ]

  it('selects an explicit layer ahead of project targeting', () => {
    expect(
      getMapResourceDeepLinkLayerIds(
        new URLSearchParams({ layerId: 'parks', projectId: 'neon-project' }),
        layers,
        projects,
      ),
    ).toEqual(['parks'])
  })

  it('selects every layer for an explicit project ID', () => {
    expect(
      getMapResourceDeepLinkLayerIds(
        new URLSearchParams({ projectId: 'neon-project' }),
        layers,
        projects,
      ),
    ).toEqual(['neon-signs', 'neon-art'])
  })

  it('resolves a project code when no project ID is supplied', () => {
    expect(
      getMapResourceDeepLinkLayerIds(
        new URLSearchParams({ project: 'parks' }),
        layers,
        projects,
      ),
    ).toEqual(['parks'])
  })

  it('returns an empty selection for an unresolved target', () => {
    expect(
      getMapResourceDeepLinkLayerIds(
        new URLSearchParams({ project: 'missing' }),
        layers,
        projects,
      ),
    ).toEqual([])
  })

  it('does not change map selection without a targeting parameter', () => {
    expect(
      getMapResourceDeepLinkLayerIds(new URLSearchParams(), layers, projects),
    ).toBeNull()
  })
})
