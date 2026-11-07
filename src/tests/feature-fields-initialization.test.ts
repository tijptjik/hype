// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'

// Exercise the route's prerequisite guard through resource settlement and form hydration.
const route = readFileSync('src/routes/admin/features/[feature]/+page.svelte', 'utf8')
const identityGuard = route.indexOf(
  '  // The resource settles before configureForm hydrates',
)
const start = route.lastIndexOf('$effect(() => {', identityGuard)
const guard = ts.transpileModule(
  route.slice(start, route.indexOf('\n\n$effect(', start)),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText

function setup(isNewFeatureRef = false) {
  const setFacet = vi.fn()
  const check = new Function(
    'isCurrentRefSettled',
    'currentFormValue',
    'hasSelectedLayer',
    'activeFacet',
    'needsLayerSelection',
    'adminCtx',
    'isNewFeatureRef',
    `
    const featureRef = 'target';
    const FirstClassResource = { feature: 'feature' };
    const $effect = run => run(), untrack = run => run();
    ${guard}
    `,
  )
  return {
    setFacet,
    check: (
      settled: boolean,
      id?: string,
      layer = false,
      facet = 'fields',
      needsLayer = false,
    ) =>
      check(
        settled,
        { meta: { id } },
        layer,
        facet,
        needsLayer,
        { setFacet },
        isNewFeatureRef,
      ),
  }
}

describe('Feature Fields deep-link prerequisites', () => {
  it('retains Fields while the resource settles before its populated form hydrates', () => {
    const state = setup()
    state.check(false)
    state.check(true)
    state.check(true, 'previous')
    state.check(true, 'target', true)
    expect(state.setFacet).not.toHaveBeenCalled()
  })

  it('returns to Core when the hydrated feature has no layer or its layer is removed', () => {
    const state = setup()
    state.check(true, 'target', true)
    state.check(true, 'target')
    expect(state.setFacet).toHaveBeenCalledExactlyOnceWith('core', 'target', 'feature')
  })

  it('still guards an unsaved feature without a layer', () => {
    const state = setup(true)
    state.check(true)
    expect(state.setFacet).toHaveBeenCalledExactlyOnceWith('core', 'target', 'feature')
  })

  it.each(['core', 'location', 'images', 'updates'])(
    'leaves the %s deep link selected',
    facet => {
      const state = setup()
      state.check(true, 'target', false, facet)
      expect(state.setFacet).not.toHaveBeenCalled()
    },
  )
})
