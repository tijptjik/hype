// TESTS
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import {
  handleResourceFormSubmissionResult,
  prepareSubmitPayloadMeta,
} from '#lib/client/services/form.js'
import { toast } from 'svelte-sonner'
import {
  captureFormNavigationSnapshot,
  invalidateFormNavigationSnapshots,
  isCurrentFormNavigationSnapshot,
} from '#lib/client/formNavigationSnapshot.js'

// Run the editor's actual save callback without mounting its map and remote queries.
const route = readFileSync('src/routes/admin/features/[feature]/+page.svelte', 'utf8')
const script = ts.createSourceFile(
  'feature.ts',
  route.split('<script lang="ts">')[1]!.split('</script>')[0]!,
  ts.ScriptTarget.Latest,
  true,
)
let refreshSource = ''
let refSource = ''
function visit(node: ts.Node): void {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(script) === 'refreshResource'
  ) {
    refreshSource = node.initializer.getText(script)
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(script) === 'featureRef' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    refSource = node.initializer.arguments[0]!.getText(script)
  }
  ts.forEachChild(node, visit)
}
visit(script)

const javascript = ts.transpileModule(
  `
  const adminCtx = { locationCreation: { clear() {} } };
  let savedLocationNameDraft = {}, draftSelectionSaved = false, draftSelectionBefore = {};
  let isNewFeatureRef = true, draftLocalKind = undefined, pendingNavigationRestore = null;
  const refresh = ${refreshSource.replaceAll('import.meta.env.DEV', 'false')};
  return {
    refresh,
    ref: () => ${refSource},
    leaveNew: () => { isNewFeatureRef = false },
  };
`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText

function setup(linked = false) {
  const navigationDraftScope = `feature:new:${crypto.randomUUID()}`
  const navigationSnapshot = captureFormNavigationSnapshot(navigationDraftScope, {
    title: 'Draft',
  })
  const page = {
    params: { feature: 'new' },
    url: new URL('http://localhost/admin/features/new?layer=tea#core'),
    shallow: {
      params: { feature: 'new' },
      url: new URL('http://localhost/admin/features/new?layer=tea#location'),
    },
    state: { draftLocationResult: 'discovery', retained: 'state' },
  }
  const goto = vi.fn(async (url: URL, _options: Record<string, unknown>) => {
    page.shallow = {
      url,
      params: { feature: decodeURIComponent(url.pathname.split('/').at(-1)!) },
    }
  })
  const finishDraftPlaceLink = vi.fn(async () => {})
  const refreshFeature = vi.fn(
    async (_ref?: string, _options?: { adoptCreated?: boolean }) => {},
  )
  const make = new Function(
    'page',
    'goto',
    'finishDraftPlaceLink',
    'refreshFeature',
    'draftPlaceSource',
    'invalidateFormNavigationSnapshots',
    'navigationDraftScope',
    javascript,
  )
  const editor = make(
    page,
    goto,
    finishDraftPlaceLink,
    refreshFeature,
    linked ? {} : null,
    invalidateFormNavigationSnapshots,
    navigationDraftScope,
  )
  const outcome = {
    data: { meta: { mode: 'create' } },
    success: true,
    result: { data: { id: 'saved-feature', modifiedAt: '2026-10-29T12:00:00Z' } },
  }
  return {
    ...editor,
    page,
    goto,
    finishDraftPlaceLink,
    refreshFeature,
    outcome,
    hasRestorableDraft: () =>
      isCurrentFormNavigationSnapshot(navigationDraftScope, navigationSnapshot),
  }
}

describe('new Feature silent save navigation', () => {
  it('preserves the draft and navigation checkpoint after a rejected save', async () => {
    const state = setup(true)
    await state.refresh({ ...state.outcome, success: false, result: undefined })
    expect(state.refreshFeature).not.toHaveBeenCalled()
    expect(state.goto).not.toHaveBeenCalled()
    expect(state.finishDraftPlaceLink).not.toHaveBeenCalled()
    expect(state.hasRestorableDraft()).toBe(true)
  })

  it('replaces the current URL in place and adopts the saved ID for the next update', async () => {
    const state = setup()
    expect(state.hasRestorableDraft()).toBe(true)
    await state.refresh(state.outcome)
    expect(state.hasRestorableDraft()).toBe(false)
    expect(state.goto).toHaveBeenCalledOnce()
    const [url, options] = state.goto.mock.calls[0]!
    expect(url.href).toBe(
      'http://localhost/admin/features/saved-feature?layer=tea#location',
    )
    expect(options).toEqual({
      shallow: true,
      replace: true,
      reset: false,
      state: { retained: 'state', draftLocationResult: undefined },
    })
    expect(state.refreshFeature).toHaveBeenCalledExactlyOnceWith('saved-feature', {
      adoptCreated: true,
    })
    expect(state.refreshFeature).toHaveBeenCalledBefore(state.goto)
    expect(state.ref()).toBe('saved-feature')
    expect(
      prepareSubmitPayloadMeta(
        { data: {} },
        {
          defaultMode: state.ref() === 'new' ? 'create' : 'update',
          resolveUpdateId: () => state.ref(),
        },
      ),
    ).toMatchObject({ meta: { mode: 'update', id: 'saved-feature' } })
  })

  it('finishes the requested Location association before changing the URL', async () => {
    const state = setup(true)
    await state.refresh(state.outcome)
    expect(state.finishDraftPlaceLink).toHaveBeenCalledWith(state.outcome.result.data)
    expect(state.finishDraftPlaceLink).toHaveBeenCalledBefore(state.goto)
  })

  it('does not pull the user back if they leave while the Location association settles', async () => {
    const state = setup(true)
    state.finishDraftPlaceLink.mockImplementation(async () => {
      state.leaveNew()
    })
    await state.refresh(state.outcome)
    expect(state.goto).not.toHaveBeenCalled()
  })

  it.each([
    { success: false },
    { data: { meta: { mode: 'update' } } },
    { result: undefined },
    { result: { data: null } },
    { result: { data: { id: '' } } },
  ])(
    'keeps failures, updates, and missing saved IDs on their current route: %j',
    async override => {
      const state = setup()
      await state.refresh({ ...state.outcome, ...override })
      expect(state.goto).not.toHaveBeenCalled()
    },
  )

  it('keeps the standard Created confirmation through the save callback', async () => {
    const state = setup()
    const successToast = vi.spyOn(toast, 'success')
    try {
      await handleResourceFormSubmissionResult({
        success: true,
        nameKey: 'title',
        successPrefix: 'Created',
        submittedValues: { data: { title: 'Tea' } },
        refreshResource: () => state.refresh(state.outcome),
      })
      expect(successToast).toHaveBeenCalledExactlyOnceWith('Created “Tea”', {
        description: expect.any(String),
      })
      expect(state.goto).toHaveBeenCalledBefore(successToast)
      expect(state.ref()).toBe('saved-feature')
    } finally {
      successToast.mockRestore()
    }
  })

  it('starts the toast duration after slow post-save work and still confirms a persisted save if refresh fails', async () => {
    const successToast = vi.spyOn(toast, 'success')
    let rejectRefresh!: (reason: Error) => void
    const refresh = new Promise<void>((_resolve, reject) => {
      rejectRefresh = reject
    })
    try {
      const pending = handleResourceFormSubmissionResult({
        success: true,
        nameKey: 'title',
        successPrefix: 'Created',
        refreshResource: () => refresh,
      })
      expect(successToast).not.toHaveBeenCalled()
      const failed = expect(pending).rejects.toThrow('Refresh failed')
      rejectRefresh(new Error('Refresh failed'))
      await failed
      expect(successToast).toHaveBeenCalledExactlyOnceWith('Created', {
        description: expect.any(String),
      })
    } finally {
      successToast.mockRestore()
    }
  })
})
