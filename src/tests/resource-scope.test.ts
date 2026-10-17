import { describe, expect, it, vi } from 'vitest'
import {
  ResourceScope,
  type ResourceScopeDependencies,
} from '#lib/context/resourceScope.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

/** @returns Scope with observable refresh ordering and cached descendants. */
function setup() {
  const calls: string[] = []
  const layers = [
    { id: 'a', projectId: 'p', organisationId: 'o', isDefaultVisible: true },
    { id: 'b', projectId: 'p', organisationId: 'o', isDefaultVisible: false },
    { id: 'c', projectId: 'q', organisationId: 'other', isDefaultVisible: true },
  ] as Layer[]
  const dependencies: ResourceScopeDependencies = {
    account: () => new AccountState(null),
    hub: () => ({ id: 'hub', code: 'hub' }) as never,
    loadedLayers: () => [],
    projects: () => [{ id: 'p', organisationId: 'o' }] as Project[],
    layers: () => layers,
    getHubIdByCode: () => undefined,
    isExpectedRoleScopeCurrent: scope => scope !== 'stale',
    refreshOrganisations: vi.fn(async () => {
      calls.push('organisations')
    }),
    refreshProjects: vi.fn(async () => {
      calls.push('projects')
    }),
    refreshProperties: vi.fn(async () => {
      calls.push('properties')
    }),
    refreshLayers: vi.fn(async () => {
      calls.push('layers')
    }),
    refreshLayerDependents: vi.fn(async () => {}),
    postLayerMutation: vi.fn(async () => {
      calls.push('reconcile')
    }),
    invalidateAndRefresh: vi.fn(async () => {}),
  }
  const scope = new ResourceScope(dependencies)
  scope.selectionLayers = layers
  return { scope, dependencies, calls }
}

describe('resource scope', () => {
  it('removes cached descendants even when they are absent from the loaded page', async () => {
    const { scope, calls, dependencies } = setup()
    scope.prisms = {
      organisation: ['o', 'other'],
      project: ['p', 'q'],
      layer: ['a', 'b', 'c'],
    }
    await scope.deactivateOrganisation('o')
    expect(scope.prisms).toEqual({
      organisation: ['other'],
      project: ['q'],
      layer: ['c'],
    })
    expect(calls).toEqual(['projects', 'properties', 'layers'])
    expect(dependencies.refreshLayers).toHaveBeenCalledWith(true, false)
  })

  it('loads scope before selecting defaults and reconciles dependent filters afterward', async () => {
    const { scope, calls } = setup()
    scope.prisms.layer = ['c']
    await scope.isolateProject('p')
    expect(scope.prisms.project).toEqual(['p'])
    expect(scope.prisms.layer).toEqual(['a'])
    expect(calls).toEqual(['properties', 'layers', 'reconcile'])
  })

  it('rejects initial defaults for an obsolete account scope', () => {
    const { scope } = setup()
    scope.prisms.layer = ['existing']
    scope.applyInitialLayerPrisms('stale')
    expect(scope.prisms.layer).toEqual(['existing'])
  })
})
