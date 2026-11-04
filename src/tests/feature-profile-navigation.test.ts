import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Exercise the route's real loader without mounting its map, header, and remote-form contexts.
const route = readFileSync('src/routes/admin/features/[feature]/+page.svelte', 'utf8')
const loader = route.slice(
  route.indexOf('async function refreshFeature('),
  route.indexOf('\n/**\n * Caches the hydrated organisation'),
)
const javascript = ts.transpileModule(loader, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setup() {
  const response = deferred<unknown>()
  const location = deferred<unknown>()
  const project = deferred<unknown>()
  const layer = deferred<unknown>()
  const commit = vi.fn()
  const syncProject = vi.fn()
  const syncLayer = vi.fn()
  const setFeature = vi.fn()
  const feature = { data: { id: 'next', projectId: 'project', layerId: 'layer' } }
  const create = new Function(
    'getFeature',
    'getFeatureLocation',
    'adminCtx',
    'commitSettledFeatureState',
    'syncSelectedProject',
    'syncSelectedLayer',
    `
    let featureRef = 'next', featureFormSource = null, hasProgrammaticDirtyChanges = false;
    const NEW_REF = 'new';
    const toParentProjectItem = value => value, toParentLayerItem = value => value;
    const toFeatureFormInput = value => value;
    ${javascript}
    return { load: refreshFeature, navigate: ref => { featureRef = ref }, form: () => featureFormSource };
  `,
  )
  const api = create(
    () => response.promise,
    () => {
      throw new Error('Profile navigation must not fetch the Location')
    },
    {
      view: {
        resources: { queryMeta: {} },
        getProjectById: () => project.promise,
        getLayerById: () => layer.promise,
        setFeatureById: setFeature,
      },
    },
    commit,
    syncProject,
    syncLayer,
  )
  return {
    ...api,
    response,
    location,
    project,
    layer,
    commit,
    syncProject,
    syncLayer,
    setFeature,
    feature,
  }
}

describe('Feature profile navigation readiness', () => {
  it('settles while both parents remain pending, without fetching the related Location', async () => {
    const state = setup()
    const pending = state.load('next')
    expect(state.commit).not.toHaveBeenCalled()
    state.response.resolve(state.feature)
    await pending
    expect(state.commit).toHaveBeenCalledWith(state.feature)
    expect(state.form()).toEqual(state.feature.data)
    expect(state.syncProject).not.toHaveBeenCalled()
    expect(state.syncLayer).not.toHaveBeenCalled()
    // Resolving unrelated parent reads later must not replay the Feature form seed.
    state.project.resolve({ flags: { locationBasedFeatureNames: true } })
    state.layer.resolve({ metadata: {} })
    await Promise.resolve()
    expect(state.commit).toHaveBeenCalledTimes(1)
  })

  it('does not replace the active form when a superseded navigation finishes late', async () => {
    const state = setup()
    const pending = state.load('next')
    state.navigate('later')
    state.response.resolve(state.feature)
    state.location.resolve(null)
    state.project.resolve(null)
    state.layer.resolve(null)
    await pending
    expect(state.commit).not.toHaveBeenCalled()
    expect(state.setFeature).not.toHaveBeenCalled()
    expect(state.syncProject).not.toHaveBeenCalled()
    expect(state.form()).toBeNull()
  })
})
