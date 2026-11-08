// NODE
import { readFileSync } from 'node:fs'
// TESTS
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
// CLIENT
import {
  captureFormNavigationSnapshot,
  invalidateFormNavigationSnapshots,
  isCurrentFormNavigationSnapshot,
} from '#lib/client/formNavigationSnapshot.js'

// Execute the actual save callback without mounting the unrelated feature editor panels.
const component = readFileSync(
  'src/routes/admin/features/[feature]/+page.svelte',
  'utf8',
)
const script = component.slice(
  component.indexOf('>') + 1,
  component.indexOf('</script>'),
)
const syntax = ts.createSourceFile('feature.ts', script, ts.ScriptTarget.Latest, true)
let callback = ''
/** Find the editor's resource-save callback in its real component source.
 * @param node Parsed TypeScript node.
 * @returns Nothing; records the matching callback for execution below.
 */
function visit(node: ts.Node): void {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(syntax) === 'refreshResource'
  ) {
    callback = node.initializer.getText(syntax)
  }
  ts.forEachChild(node, visit)
}
visit(syntax)
if (!callback) throw new Error('Feature save callback not found')
const javascript = ts.transpileModule(
  `const refreshResource = ${callback.replaceAll('import.meta.env.DEV', 'false')}`,
  { compilerOptions: { target: ts.ScriptTarget.ESNext } },
).outputText

it.each([false, true])(
  'revision saves invalidate history even if refresh fails (%s)',
  async failRefresh => {
    const scope = `save-test:${crypto.randomUUID()}`
    const stale = captureFormNavigationSnapshot(scope, { title: 'Before save' })
    const other = captureFormNavigationSnapshot('unrelated-account:feature', {
      title: 'Other',
    })
    const refresh = vi.fn(async () => {
      // The persisted save must invalidate history before awaiting its follow-up query.
      expect(isCurrentFormNavigationSnapshot(scope, stale)).toBe(false)
      if (failRefresh) throw new Error('Refresh offline')
    })
    const harness = new Function(
      'invalidateFormNavigationSnapshots',
      'navigationDraftScope',
      'refreshFeature',
      `
    let pendingNavigationRestore = { stale: true };
    let hasProgrammaticDirtyChanges = true;
    let revisionWorkspaceVersion = 0;
    ${javascript}
    return { refreshResource, pending: () => pendingNavigationRestore };
  `,
    )(invalidateFormNavigationSnapshots, scope, refresh)
    const saved = harness.refreshResource({
      data: {},
      success: true,
      result: { revisionApplied: true },
    })
    if (failRefresh) await expect(saved).rejects.toThrow('Refresh offline')
    else await saved
    expect(refresh).toHaveBeenCalledOnce()
    expect(harness.pending()).toBeNull()
    expect(isCurrentFormNavigationSnapshot(scope, stale)).toBe(false)
    expect(isCurrentFormNavigationSnapshot('unrelated-account:feature', other)).toBe(
      true,
    )
  },
)
