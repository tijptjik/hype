// NODE
import { readFileSync } from 'node:fs'
// TESTS
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

// Exercise the real adapter action without bootstrapping the admin resource tree.
const source = readFileSync(
  'src/lib/adapters/header/useAdminHeaderModel.svelte.ts',
  'utf8',
)
const syntax = ts.createSourceFile('header.ts', source, ts.ScriptTarget.Latest, true)
let callback = ''
/** Extract the adapter's Save action producer.
 * @param node Current syntax node.
 * @returns Nothing; captures the producer for execution.
 */
function visit(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(syntax) === 'saveAction' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  )
    callback = node.initializer.arguments[0].getText(syntax)
  ts.forEachChild(node, visit)
}
visit(syntax)
if (!callback) throw new Error('Save action producer missing')
const javascript = ts.transpileModule(`const action = ${callback}`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText

it('allows a dirty draft to retry validation after saving, while retaining busy and permission guards', () => {
  const submit = vi.fn()
  const create = (
    dirty: boolean,
    busy = false,
    canEdit = true,
    disableEdit = false,
    disableSave = false,
  ) =>
    new Function(
      'isTainted',
      'isInFlight',
      'canEdit',
      'disableEdit',
      'handleSave',
      'formActions',
      `
      const isEditing = true, isSubmitting = false, hasIssues = true;
      const m = { forms__save: () => 'Save' }, Save = null, LoaderCircle = null;
      ${javascript}
      return action();
    `,
    )(dirty, busy, canEdit, disableEdit, submit, { disableSave })
  expect(create(true, false, true, false, true).disabled).toBe(true)
  expect(create(false).disabled).toBe(true)
  const retry = create(true)
  expect(retry.disabled).toBe(false)
  retry.onClick()
  expect(submit).toHaveBeenCalledOnce()
  expect(create(true, true).disabled).toBe(true)
  expect(create(true, false, false)).toBeNull()
  expect(create(true, false, true, true).disabled).toBe(true)
})
