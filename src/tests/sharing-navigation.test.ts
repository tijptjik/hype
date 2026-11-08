// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { expect, it, vi } from 'vitest'
import ts from 'typescript'

// Execute the actual layout function and effect so navigation cleanup remains under test.
const component = readFileSync('src/routes/(public)/+layout.svelte', 'utf8')
const script = component.slice(
  component.indexOf('>') + 1,
  component.indexOf('</script>'),
)
const syntax = ts.createSourceFile('layout.ts', script, ts.ScriptTarget.Latest, true)
let route = ''
let effect = ''
/** Collect the public-route operation and its owning reactive effect.
 * @param node Parsed layout node.
 * @returns Nothing; captures the source executed by the harness.
 */
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'applyPublicResourceRoute')
    route = node.getText(syntax)
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(syntax) === '$effect' &&
    node.arguments[0]?.getText(syntax).includes('applyPublicResourceRoute(')
  )
    effect = node.arguments[0].getText(syntax)
  ts.forEachChild(node, visit)
}
visit(syntax)
if (!route || !effect) throw new Error('Public sharing route implementation not found')
const javascript = ts.transpileModule(`${route}\nconst runEffect = ${effect}`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText

/** Create a controllable read boundary for an overlapping navigation.
 * @returns Promise and its completion controls.
 */
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Mount the actual route effect against a scoped, delayed query adapter.
 * @param stage Read or reconciliation boundary to delay once.
 * @returns Navigation driver, pending operations and observable scope.
 */
function harness(stage: 'projects' | 'layers' | 'reconcile') {
  const gate = deferred(),
    reached = deferred()
  let held = false
  const pause = async (name: string): Promise<void> => {
    if (name === stage && !held) {
      held = true
      reached.resolve()
      await gate.promise
    }
  }
  const view = {
    isInitialised: true,
    scope: {
      prisms: {
        organisation: [] as string[],
        project: [] as string[],
        layer: [] as string[],
      },
    },
    queries: {
      rows: {
        project: [
          { id: 'a', organisationId: 'o' },
          { id: 'b', organisationId: 'o' },
        ],
        layer: [] as { id: string; projectId: string }[],
      },
      refreshProjects: vi.fn(async () => {
        await pause('projects')
      }),
      refreshLayers: vi.fn(async () => {
        await pause('layers')
        view.queries.rows.layer = view.scope.prisms.project.map(id => ({
          id: `layer-${id}`,
          projectId: id,
        }))
      }),
      refreshFeatures: vi.fn(async () => {}),
    },
    postLayerMutation: vi.fn(async () => {
      await pause('reconcile')
    }),
  }
  const factory = new Function(
    'appCtx',
    `
    let page = { data: { shareResource: null } }, preview = false, error = '';
    const untrack = callback => callback();
    ${javascript}
    const original = applyPublicResourceRoute, pending = [];
    applyPublicResourceRoute = (...args) => { const promise = original(...args); pending.push(promise); return promise };
    let cleanup;
    return { pending, error: () => error, navigate(target, isPreview = false) {
      cleanup?.(); page.data.shareResource = target; preview = isPreview; cleanup = runEffect();
    } };
  `,
  )
  return { view, gate, reached, ...factory({ view }) }
}

it.each(['projects', 'layers', 'reconcile'] as const)(
  'preserves the newer route when an older %s request completes late',
  async stage => {
    const h = harness(stage)
    h.navigate({ kind: 'project', id: 'a' })
    await h.reached.promise
    h.navigate({ kind: 'project', id: 'b' })
    await h.pending[1]
    expect(h.view.scope.prisms.layer).toEqual(['layer-b'])
    h.gate.resolve()
    await h.pending[0]
    expect(h.view.scope.prisms).toEqual({
      organisation: [],
      project: ['b'],
      layer: ['layer-b'],
    })
    expect(h.view.queries.refreshFeatures).toHaveBeenCalledTimes(1)
  },
)

it.each(['leave', 'feature', 'preview'] as const)(
  'stops pending route work on %s navigation',
  async destination => {
    const h = harness('projects')
    h.navigate({ kind: 'project', id: 'a' })
    await h.reached.promise
    h.navigate(
      destination === 'leave'
        ? null
        : { kind: destination === 'feature' ? 'feature' : 'project', id: 'b' },
      destination === 'preview',
    )
    h.gate.resolve()
    await h.pending[0]
    expect(h.view.queries.refreshLayers).not.toHaveBeenCalled()
    expect(h.view.queries.refreshFeatures).not.toHaveBeenCalled()
  },
)

it.each([false, true])(
  'reports only current route errors (superseded=%s)',
  async superseded => {
    const h = harness('projects')
    h.navigate({ kind: 'project', id: 'a' })
    await h.reached.promise
    if (superseded) {
      h.navigate({ kind: 'project', id: 'b' })
      await h.pending[1]
    }
    h.gate.reject(new Error('Read failed'))
    await Promise.allSettled(h.pending)
    expect(h.error()).toBe(superseded ? '' : 'Error: Read failed')
  },
)
