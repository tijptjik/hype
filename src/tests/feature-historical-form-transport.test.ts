// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  create_field_proxy,
  convert_formdata,
  // @ts-expect-error Exercise the installed, untyped SvelteKit internal transport.
} from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
import { featureCreationSourceLayerId } from '#lib/bits/patterns/forms/formFeatureParentSection/formFeatureParentSection.controller.js'

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
let selectLayer = ''
let searchLayers = ''
/** Extract the actual editor hidden-control producer to test its transport boundary.
 * @param node Parsed editor node.
 * @returns Nothing; captures the producer callback.
 */
function visit(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(syntax) === 'hiddenLayerInputAttrs' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    callback = node.initializer.arguments[0].getText(syntax)
  }
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text === 'applyFeatureParentSelection'
  )
    selectLayer = node.getText(syntax)
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(syntax) === 'searchParentLayers'
  )
    searchLayers = node.initializer.getText(syntax)
  ts.forEachChild(node, visit)
}
visit(syntax)
if (!callback) throw new Error('Missing layer hidden-control producer')
const javascript = ts.transpileModule(`const produce = ${callback}`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText

describe('feature layer form transport', () => {
  it.each([
    [true, 'historical', undefined, 'source'],
    [false, 'historical', 'historical', 'historical'],
    [false, 'historical', 'source', 'source'],
    [false, 'historical', 'other', 'source'],
    [false, 'ordinary', 'historical', 'ordinary'],
    [true, 'ordinary', undefined, 'ordinary'],
  ] as const)(
    'serializes the correct layer (create=%s, selection=%s)',
    (isNewFeatureRef, layerIdValue, persistedLayerId, expected) => {
      const state = { data: { layerId: layerIdValue } }
      const set = vi.fn()
      const fields = create_field_proxy({
        form_id: 'new',
        get: () => state,
        set,
        get_issues: () => ({}),
        get_touched: () => ({}),
        get_dirty: () => ({}),
      })
      const attrs = new Function(
        'formCtx',
        'layerIdValue',
        'isNewFeatureRef',
        'selectedLayer',
        'feature',
        'featureCreationSourceLayerId',
        `${javascript}; return produce()`,
      )(
        { form: { fields } },
        layerIdValue,
        isNewFeatureRef,
        { id: 'historical', historicalSourceLayerId: 'source' },
        { data: { layerId: persistedLayerId } },
        featureCreationSourceLayerId,
      )
      const form = document.createElement('form')
      const input = document.createElement('input')
      input.type = attrs.type
      input.name = attrs.name
      input.value = attrs.value
      form.append(input)
      const payload = convert_formdata('new', new FormData(form))
      expect(payload.data.layerId).toBe(expected)
      expect(state.data.layerId).toBe(layerIdValue)
      expect(set).not.toHaveBeenCalled()
    },
  )
})

it.each([true, false])(
  'historical selection sets status and ordinary selection clears it (create=%s)',
  isNewFeatureRef => {
    let data = { layerId: 'ordinary', isIntangible: false }
    const javascript = ts.transpileModule(selectLayer, {
      compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText
    const select = new Function(
      'isNewFeatureRef',
      'updateFeatureData',
      'syncLayerBackedProperties',
      `${javascript}; return applyFeatureParentSelection`,
    )(
      isNewFeatureRef,
      (update: (value: typeof data) => typeof data) => {
        data = update(data)
      },
      vi.fn(),
    )
    select({ layerId: 'historical', isIntangible: true })
    expect(data).toMatchObject({ layerId: 'historical', isIntangible: true })
    select({ layerId: 'ordinary', isIntangible: false })
    expect(data).toMatchObject({ layerId: 'ordinary', isIntangible: false })
  },
)

it.each([true, false])(
  'keeps historical search results available (create=%s)',
  async isNewFeatureRef => {
    const rows = [
      { id: 'historical', historicalSourceLayerId: 'source' },
      { id: 'ordinary' },
    ]
    const javascript = ts.transpileModule(`const search = ${searchLayers}`, {
      compilerOptions: { target: ts.ScriptTarget.ESNext },
    }).outputText
    const search = new Function(
      'isNewFeatureRef',
      'getLayers',
      'createFeatureParentSearchPrisms',
      'adminCtx',
      `${javascript}; return search`,
    )(
      isNewFeatureRef,
      async () => ({ data: rows }),
      () => ({}),
      { view: { resources: { queryMeta: {} } } },
    )
    expect(await search({ query: 'Hi' })).toEqual(rows)
  },
)
