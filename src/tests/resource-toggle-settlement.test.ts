// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { getEditorCtrl } from '#lib/client/services/form.js'
import type { Component } from 'svelte'

/** Executes the actual route handler with controlled write and reconciliation boundaries. */
function setup(kind: 'layer' | 'organisation' | 'project') {
  const title =
    kind === 'layer' ? 'Layer' : kind === 'project' ? 'Project' : 'Organisation'
  const path =
    kind === 'layer'
      ? 'layers/[layer]'
      : kind === 'project'
        ? 'projects/[project]'
        : 'organisations/[organisation]'
  const route = readFileSync(`src/routes/admin/${path}/+page.svelte`, 'utf8')
  const start = route.indexOf(`async function handle${title}StateToggle(`)
  const source = route.slice(start, route.indexOf('let pendingPreviewId', start))
  const original = {
    data: {
      id: 'one',
      code: 'one',
      isPublished: false,
      isArchived: false,
      relations: ['retained'],
    },
  }
  const env = {
    original,
    write: Promise.resolve({ data: { id: 'one', isPublished: true } }) as Promise<{
      data: { id: string; isPublished?: boolean; isArchived?: boolean }
    }>,
    refresh: vi.fn<() => Promise<unknown>>(async () => original),
    reconcile: vi.fn(async () => {}),
    settle: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    busy: vi.fn(),
  }
  const editorCtrl = getEditorCtrl({
    headerCtrl: {
      setEditing: vi.fn(),
      setFormActions: vi.fn(),
      setHeaderForEntity: vi.fn(),
      clearFormActions: vi.fn(),
    },
    icon: (() => ({})) as Component,
    facetTabs: new Map(),
  })
  let cleanup = editorCtrl.syncRouteAndLoad({
    ref: 'one',
    resetFormActionsSignature: () => {},
    setFacetForRef: () => {},
    load: async () => null,
    commit: () => {},
  })
  const lifecycle = {
    editorCtrl,
    dispose: () => cleanup(),
    enter: () => {
      cleanup()
      cleanup = editorCtrl.syncRouteAndLoad({
        ref: 'two',
        resetFormActionsSignature: () => {},
        setFacetForRef: () => {},
        load: async () => null,
        commit: () => {},
      })
    },
  }
  const script = `
    const editorCtrl = lifecycle.editorCtrl;
    let ${kind} = env.original;
    let committed${title} = env.original;
    let ${kind}Ref = 'one';
    let scope = 'scope-a';
    let cacheGeneration = 0;
    const adminCtx = { view: {
      resources: { get scopeKey() { return scope; }, queryMeta: {} },
      scope: { prisms: {} }, isSuperAdmin: () => true,
      cacheCtx: { get generation() { return cacheGeneration; }, beginMutation: () => ({ updates: [], settle: env.settle }), reconcile: env.reconcile }
    } };
    const toast = { success: env.success, error: env.error, warning: env.warning };
    const m = { long_crazy_peacock_care: () => 'write failed' };
    const getNameForToast = () => 'Original name';
    const get${title} = () => ({});
    const get${title}s = () => ({});
    const refresh${title} = env.refresh;
    const commit${title}State = value => { ${kind} = value; };
    const commitSettled${title}State = commit${title}State;
    ${source}
    return {
      run: (field = 'isPublished') => handle${title}StateToggle({
        field, successWhenTrue: 'published', successWhenFalse: 'unpublished',
        setBusy: env.busy, mutate: () => ({ updates: () => env.write })
      }),
      current: () => ${kind},
      receiveRelations: () => { ${kind} = { ...${kind}, data: { ...${kind}.data, relations: ['fresh'] } }; },
      dispose: lifecycle.dispose,
      resetAccount: () => { cacheGeneration++; lifecycle.dispose(); },
      navigate: () => { lifecycle.enter(); ${kind}Ref = 'two'; ${kind} = { data: { id: 'two', isPublished: false } }; scope = 'scope-b'; }
    };
  `
  const js = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const handler = new Function('env', 'lifecycle', js)(env, lifecycle) as {
    run: (field?: 'isPublished' | 'isArchived') => Promise<void>
    receiveRelations: () => void
    current: () => typeof original | null
    navigate: () => void
    dispose: () => void
    resetAccount: () => void
  }
  return { env, handler }
}

for (const kind of ['layer', 'organisation', 'project'] as const) {
  describe(`${kind} state command settlement`, () => {
    it.each(['isPublished', 'isArchived'] as const)(
      'settles %s from the acknowledgement without a second detail read',
      async field => {
        const { env, handler } = setup(kind)
        env.refresh.mockResolvedValue(null)
        env.write = Promise.resolve({ data: { id: 'one', [field]: true } })
        await handler.run(field)
        expect(handler.current()?.data).toMatchObject({
          id: 'one',
          [field]: true,
          relations: ['retained'],
        })
        expect(env.refresh).not.toHaveBeenCalled()
        expect(env.settle.mock.calls).toEqual([[true]])
        expect(env.error).not.toHaveBeenCalled()
        expect(env.success).toHaveBeenCalledOnce()
      },
    )

    it('does not report a failed write when post-commit reconciliation rejects', async () => {
      const { env, handler } = setup(kind)
      env.reconcile.mockRejectedValue(new Error('read unavailable'))
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await handler.run()
        expect(env.settle.mock.calls).toEqual([[true]])
        expect(env.error).not.toHaveBeenCalled()
        expect(env.success).toHaveBeenCalledOnce()
        expect(handler.current()?.data.isPublished).toBe(true)
      } finally {
        warning.mockRestore()
      }
    })

    it('retains the original editor and rejects optimism when the write fails', async () => {
      const { env, handler } = setup(kind)
      env.write = Promise.reject(new Error('write rejected'))
      await handler.run()
      expect(handler.current()).toEqual(env.original)
      expect(env.settle.mock.calls).toEqual([[false]])
      expect(env.reconcile).not.toHaveBeenCalled()
      expect(env.error).toHaveBeenCalledOnce()
      expect(env.success).not.toHaveBeenCalled()
    })

    it('preserves fresher relation data delivered while the command is pending', async () => {
      const { env, handler } = setup(kind)
      let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
      env.write = new Promise(done => {
        resolve = done
      })
      const pending = handler.run()
      handler.receiveRelations()
      resolve({ data: { id: 'one', isPublished: true } })
      await pending
      expect(handler.current()?.data).toMatchObject({
        isPublished: true,
        relations: ['fresh'],
      })
    })

    it.each(['navigation', 'unmount'] as const)(
      'ignores late success side effects after %s',
      async transition => {
        const { env, handler } = setup(kind)
        let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
        env.write = new Promise(done => {
          resolve = done
        })
        const pending = handler.run()
        if (transition === 'navigation') handler.navigate()
        else handler.dispose()
        env.busy.mockClear()
        resolve({ data: { id: 'one', isPublished: true } })
        await pending
        expect(env.settle.mock.calls).toEqual([[true]])
        expect(env.busy).not.toHaveBeenCalled()
        expect(env.reconcile).toHaveBeenCalledOnce()
        expect(env.success).not.toHaveBeenCalled()
        expect(env.error).not.toHaveBeenCalled()
      },
    )

    it.each(['navigation', 'unmount'] as const)(
      'ignores late failure side effects after %s',
      async transition => {
        const { env, handler } = setup(kind)
        let reject!: (reason: unknown) => void
        env.write = new Promise((_done, fail) => {
          reject = fail
        })
        const pending = handler.run()
        if (transition === 'navigation') handler.navigate()
        else handler.dispose()
        env.busy.mockClear()
        reject(new Error('obsolete write failed'))
        await pending
        expect(env.settle.mock.calls).toEqual([[false]])
        expect(env.busy).not.toHaveBeenCalled()
        expect(env.reconcile).not.toHaveBeenCalled()
        expect(env.error).not.toHaveBeenCalled()
      },
    )

    it('does not reconcile an obsolete account cache generation after a late success', async () => {
      const { env, handler } = setup(kind)
      let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
      env.write = new Promise(done => {
        resolve = done
      })
      const pending = handler.run()
      handler.resetAccount()
      env.busy.mockClear()
      resolve({ data: { id: 'one', isPublished: true } })
      await pending
      expect(env.settle.mock.calls).toEqual([[true]])
      expect(env.busy).not.toHaveBeenCalled()
      expect(env.reconcile).not.toHaveBeenCalled()
      expect(env.success).not.toHaveBeenCalled()
    })

    it('does not replace another route after a late write acknowledgement', async () => {
      const { env, handler } = setup(kind)
      let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
      env.write = new Promise(done => {
        resolve = done
      })
      const pending = handler.run()
      handler.navigate()
      resolve({ data: { id: 'one', isPublished: true } })
      await pending
      expect(handler.current()?.data).toMatchObject({ id: 'two', isPublished: false })
      expect(env.settle.mock.calls).toEqual([[true]])
    })
  })
}
