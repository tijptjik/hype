// @vitest-environment jsdom
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
// SVELTE
import { flushSync, untrack } from 'svelte'
import { compileModule } from 'svelte/compiler'
// @ts-expect-error Svelte's compiler runtime has no public declarations.
import * as client from 'svelte/internal/client'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop()
})

/** Executes the Feature toggle with real Svelte state/effects and controlled remote commands. */
function setup() {
  const route = readFileSync('src/routes/admin/features/[feature]/+page.svelte', 'utf8')
  const start = route.indexOf('let featureActionRevision = 0')
  const source =
    route.slice(start, route.indexOf('const shouldOfferImagePublication', start)) +
    route.slice(
      route.indexOf('function withPublishedFeatureImages('),
      route.indexOf('// Anchor the follow-up action'),
    )
  const reactiveSource = source
    .replace('$effect(() => {', 'const stop = $effect.root(() => { $effect(() => {')
    .replace('})\n\n/**', '}) });\n\n/**')
  const env = {
    write: Promise.resolve({ data: { id: 'one', isPublished: true } }),
    refresh: vi.fn(async (): Promise<unknown> => null),
    busy: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    settle: vi.fn(),
    detail: { current: undefined as undefined | { data: Record<string, unknown> } },
  }
  const script = `
    let feature = $state({ data: { id: 'one', isPublished: false, relations: ['retained'], images: [{ id: 'image', isPublished: false }] } });
    let featureRef = $state('one'), imagePublicationPrompt = $state(null);
    let scope = $state('a');
    const isCurrentRefLoaded = true;
    const adminCtx = { view: { resources: { queryMeta: {}, get scopeKey() { return scope } }, cacheCtx: { beginMutation: () => ({ updates: [], settle: env.settle }) } } };
    const headerCtrl = { setPublishing: env.busy, setDeleting: env.busy, setFormActions: () => {} };
    const toast = { success: env.success, error: env.error };
    const m = new Proxy({}, { get: (_, key) => () => key });
    const getFeature = () => env.detail;
    const publishFeature = () => ({ updates: () => env.write }), archiveFeature = publishFeature, publishFeatureImages = publishFeature;
    const refreshFeature = env.refresh;
    const commitSettledFeatureState = value => { feature = value };
    const commitFeatureState = commitSettledFeatureState;
    ${reactiveSource}
    return {
      run: () => handleFeatureStateToggle('isPublished'), runImages: publishRemainingFeatureImages, current: () => feature,
      prompt: () => imagePublicationPrompt,
      dispose: stop, scope: () => { scope = 'b'; flushSync() },
      navigate: () => { featureRef = 'two'; feature = { data: { id: 'two', isPublished: false } }; flushSync() },
      receive: () => { feature = { ...feature, data: { ...feature.data, relations: ['fresh'] } } },
      receiveGallery: () => { feature = { ...feature, data: { ...feature.data, images: [{ id: 'new', isPublished: true }] } } },
      editInPlace: () => { feature.data.relations = ['edited'] },
      editGallery: () => { feature.data.images[0].caption = 'edited'; feature.data.images.push({ id: 'added', isPublished: true }) }
    };
  `
  const js = ts.transpileModule(`function create(env) { ${script} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiled = compileModule(js, {
    filename: 'FeatureActionCheck.svelte.js',
    generate: 'client',
  }).js.code
  const create = new Function(
    'client',
    'untrack',
    'flushSync',
    `${compiled.replace(/import \* as \$ from ['"]svelte\/internal\/client['"];?/, 'const $ = client;')}\nreturn create;`,
  )(client, untrack, flushSync)
  const handler = create(env) as {
    run: () => Promise<void>
    runImages: () => Promise<void>
    current: () => { data: Record<string, unknown> } | null
    prompt: () => unknown
    dispose: () => void
    navigate: () => void
    scope: () => void
    receive: () => void
    receiveGallery: () => void
    editInPlace: () => void
    editGallery: () => void
  }
  cleanups.push(handler.dispose)
  flushSync()
  return { env, handler }
}

describe('Feature toggle settlement', () => {
  it('preserves the editor and fresh relations without a second detail read', async () => {
    const { env, handler } = setup()
    const pending = handler.run()
    handler.receive()
    await pending
    expect(handler.current()?.data).toMatchObject({
      id: 'one',
      isPublished: true,
      relations: ['fresh'],
    })
    expect(env.refresh).not.toHaveBeenCalled()
    expect(env.settle.mock.calls).toEqual([[true]])
    expect(handler.prompt()).toEqual({ featureId: 'one', routeRef: 'one' })
  })

  it('adopts the native command refresh including image policy changes', async () => {
    const { env, handler } = setup()
    env.detail.current = {
      data: { id: 'one', images: [{ id: 'image', isPublished: true }] },
    }
    await handler.run()
    expect(handler.current()?.data.images).toEqual([{ id: 'image', isPublished: true }])
    expect(handler.current()?.data.isPublished).toBe(true)
  })

  for (const transition of ['navigate', 'dispose', 'scope'] as const) {
    it.each([true, false])(
      `settles the ledger without obsolete UI effects after ${transition} (success=%s)`,
      async success => {
        const { env, handler } = setup()
        let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
        let reject!: (reason: unknown) => void
        env.write = new Promise((done, fail) => {
          resolve = done
          reject = fail
        })
        const pending = handler.run()
        handler[transition]()
        if (success) resolve({ data: { id: 'one', isPublished: true } })
        else reject(new Error('write failed'))
        await pending
        expect(env.settle.mock.calls).toEqual([[success]])
        expect(env.busy.mock.calls).toEqual([[true]])
        expect(env.success).not.toHaveBeenCalled()
        expect(env.error).not.toHaveBeenCalled()
        expect(env.refresh).not.toHaveBeenCalled()
        expect(handler.prompt()).toBeNull()
        expect(handler.current()?.data.id).toBe(
          transition === 'navigate' ? 'two' : 'one',
        )
      },
    )
  }
})

describe('Feature bulk image settlement', () => {
  it('rolls back its own optimistic snapshot after a rejected write', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('failed'))
    await handler.runImages()
    expect(handler.current()?.data.images).toEqual([
      { id: 'image', isPublished: false },
    ])
    expect(env.settle.mock.calls).toEqual([[false]])
    expect(env.error).toHaveBeenCalledOnce()
  })

  it('does not roll a newer editor snapshot back after a rejected write', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('failed'))
    const pending = handler.runImages()
    handler.receive()
    await pending
    expect(handler.current()?.data.relations).toEqual(['fresh'])
    expect(handler.current()?.data.images).toEqual([
      { id: 'image', isPublished: false },
    ])
  })

  it('uses the native gallery update without an additional read', async () => {
    const { env, handler } = setup()
    env.detail.current = {
      data: { id: 'one', images: [{ id: 'image', isPublished: true }] },
    }
    await handler.runImages()
    expect(handler.current()?.data.images).toEqual([{ id: 'image', isPublished: true }])
    expect(env.refresh).not.toHaveBeenCalled()
    expect(env.settle.mock.calls).toEqual([[true]])
  })

  it('preserves a replacement gallery after a rejected write', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('failed'))
    const pending = handler.runImages()
    handler.receiveGallery()
    await pending
    expect(handler.current()?.data.images).toEqual([{ id: 'new', isPublished: true }])
  })

  it('restores its gallery without erasing in-place relation edits', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('failed'))
    const pending = handler.runImages()
    handler.editInPlace()
    await pending
    expect(handler.current()?.data.relations).toEqual(['edited'])
    expect(handler.current()?.data.images).toEqual([
      { id: 'image', isPublished: false },
    ])
  })

  it('restores publication only while preserving gallery additions and image metadata edits', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('failed'))
    const pending = handler.runImages()
    handler.editGallery()
    await pending
    expect(handler.current()?.data.images).toEqual([
      { id: 'image', isPublished: false, caption: 'edited' },
      { id: 'added', isPublished: true },
    ])
  })

  for (const transition of ['navigate', 'dispose', 'scope'] as const) {
    it.each([true, false])(
      `suppresses obsolete bulk-image completion after ${transition} (success=%s)`,
      async success => {
        const { env, handler } = setup()
        let resolve!: (value: { data: { id: string; isPublished: boolean } }) => void
        let reject!: (reason: unknown) => void
        env.write = new Promise((done, fail) => {
          resolve = done
          reject = fail
        })
        const pending = handler.runImages()
        handler[transition]()
        if (success) resolve({ data: { id: 'one', isPublished: true } })
        else reject(new Error('failed'))
        await pending
        expect(env.settle.mock.calls).toEqual([[success]])
        expect(env.busy.mock.calls).toEqual([[true]])
        expect(env.success).not.toHaveBeenCalled()
        expect(env.error).not.toHaveBeenCalled()
        expect(env.refresh).not.toHaveBeenCalled()
        expect(handler.current()?.data.id).toBe(
          transition === 'navigate' ? 'two' : 'one',
        )
      },
    )
  }
})
