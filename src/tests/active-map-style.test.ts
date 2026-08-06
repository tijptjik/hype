import { describe, expect, it } from 'vitest'

import { getActiveMapStyleCode } from '$lib/client/services/map'
import type { AppCtx } from '$lib/context/app.svelte'

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
}): AppCtx =>
  ({
    getActiveResourceType: () => (params.activeProjectId ? 'project' : null),
    getActiveResourceId: () => params.activeProjectId ?? null,
    state: {
      prisms: {
        project: params.selectedProjectIds,
        layer: [],
      },
      resources: {
        project: params.projects,
        layer: [],
        feature: [],
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
