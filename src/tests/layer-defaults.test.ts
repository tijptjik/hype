import { describe, expect, it } from 'vitest'
import {
  CORE_DEFAULT_PROJECT_CODE,
  getInitialHubLayerDefaultIds,
} from '$lib/client/services/layerDefaults'

describe('initial hub layer defaults', () => {
  const projects = [
    { id: 'neon-project', code: CORE_DEFAULT_PROJECT_CODE },
    { id: 'other-project', code: 'other' },
  ]
  const layers = [
    { id: 'neon-default', projectId: 'neon-project', isDefaultVisible: true },
    { id: 'neon-optional', projectId: 'neon-project', isDefaultVisible: false },
    { id: 'other-default', projectId: 'other-project', isDefaultVisible: true },
  ]

  it('activates only Neon Signs default-visible layers for the virtual core hub', () => {
    expect(
      getInitialHubLayerDefaultIds({ code: 'core', isCore: true }, layers, projects),
    ).toEqual(['neon-default'])
  })

  it('uses configured hub defaults before the core fallback', () => {
    expect(
      getInitialHubLayerDefaultIds(
        {
          code: 'core',
          isCore: true,
          layerDefaults: [
            { layerId: 'other-default', isDefaultVisible: true },
            { layerId: 'missing', isDefaultVisible: true },
          ],
        },
        layers,
        projects,
      ),
    ).toEqual(['other-default'])
  })

  it('does not apply the core fallback to named hubs', () => {
    expect(
      getInitialHubLayerDefaultIds(
        { code: 'neon-signs', isCore: false },
        layers,
        projects,
      ),
    ).toEqual([])
  })
})
