// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'

/** Runs the Hub route handler with controllable transport and route ownership. */
function setup() {
  const route = readFileSync('src/routes/admin/hubs/[hub]/+page.svelte', 'utf8')
  const start = route.indexOf('async function handleHubStateToggle(')
  const source = route.slice(
    start,
    route.indexOf('async function onPublishToggle', start),
  )
  const env = {
    write: Promise.resolve({ data: { id: 'one', isPublished: true } }),
    refresh: vi.fn(async (): Promise<unknown> => null),
    busy: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }
  const script = `
    let hub = { data: { id: 'one', code: 'one', isPublished: false, relations: ['retained'] } };
    let hubRef = 'one', scope = 'scope-a', active = true;
    const editorCtrl = { captureRoute: () => () => active };
    const adminCtx = { view: { resources: { get scopeKey() { return scope }, queryMeta: {} }, isSuperAdmin: () => true } };
    const toast = { success: env.success, error: env.error };
    const m = { long_crazy_peacock_care: () => 'failed' };
    const getHub = () => ({ withOverride: () => ({}) });
    const getHubs = getHub;
    const overrideHubEntityBoolean = () => ({}), overrideHubListItemBoolean = () => ({});
    const refreshHub = env.refresh;
    const commitSettledHubState = value => { hub = value };
    ${source}
    return {
      run: () => handleHubStateToggle({ field: 'isPublished', successWhenTrue: 'published', successWhenFalse: 'unpublished', setBusy: env.busy, mutate: () => ({ updates: () => env.write }) }),
      current: () => hub,
      dispose: () => { active = false },
      changeScope: () => { scope = 'scope-b' },
      navigate: () => { active = false; hubRef = 'two'; scope = 'scope-b'; hub = { data: { id: 'two', isPublished: false } } },
      receive: () => { hub.data.relations = ['fresh'] }
    };
  `
  const handler = new Function(
    'env',
    ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
  )(env) as {
    run: () => Promise<void>
    current: () => {
      data: { id: string; isPublished: boolean; relations?: string[] }
    } | null
    dispose: () => void
    navigate: () => void
    changeScope: () => void
    receive: () => void
  }
  return { env, handler }
}

describe('Hub toggle settlement', () => {
  it('keeps fresh relations and settles from acknowledgement without another read', async () => {
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
    expect(env.success).toHaveBeenCalledOnce()
  })

  it('retains the editor and reports a current-route write rejection', async () => {
    const { env, handler } = setup()
    env.write = Promise.reject(new Error('write failed'))
    await handler.run()
    expect(handler.current()?.data.isPublished).toBe(false)
    expect(env.error).toHaveBeenCalledOnce()
    expect(env.success).not.toHaveBeenCalled()
    expect(env.busy.mock.calls).toEqual([[true], [false]])
  })

  for (const transition of ['navigate', 'dispose', 'changeScope'] as const) {
    it.each([true, false])(
      `suppresses late feedback and busy reset after ${transition} (success=%s)`,
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
