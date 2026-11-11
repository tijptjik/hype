// TESTING
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

// Exercise the actual submit action without mounting unrelated form lifecycle effects.
const source = ts.createSourceFile(
  'factories.ts',
  readFileSync('src/lib/factories.svelte.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
)
let action = ''
function visit(node: ts.Node): void {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'requestSubmit')
    action = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)

it('explicit update metadata replaces stale create mode before native submission', () => {
  let value = {
    meta: { mode: 'create', updatedAt: 'revision' },
    data: { featureType: 'object' },
  }
  const form = {
    fields: {
      value: () => value,
      set: (next: typeof value) => {
        value = next
      },
    },
  }
  const formEl = { requestSubmit: vi.fn() }
  const sync = vi.fn()
  const begin = vi.fn()
  const javascript = ts.transpileModule(`return (${action})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const submit = new Function(
    'form',
    'formEl',
    'syncMetaHiddenInputs',
    'beginSubmitAttempt',
    javascript,
  )(form, formEl, sync, begin)
  submit({ meta: { mode: 'update', id: 'existing-feature' } })
  expect(value).toEqual({
    meta: { mode: 'update', id: 'existing-feature', updatedAt: 'revision' },
    data: { featureType: 'object' },
  })
  expect(sync).toHaveBeenCalledWith(formEl, value.meta, form)
  expect(sync).toHaveBeenCalledBefore(formEl.requestSubmit)
  expect(formEl.requestSubmit).toHaveBeenCalledOnce()
})
