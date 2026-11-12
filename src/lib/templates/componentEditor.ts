// TYPES
import type { TemplateExpression } from './displayTemplate'

export type TemplateComponentField = {
  path: number[]
  kind: 'property' | 'literal'
  label: string
  value: string
}

/** Serialize an editable component without interpreting authored text as code.
 * @param node Parsed expression. @returns Equivalent expression source.
 */
export function expressionSource(node: TemplateExpression): string {
  if (node.kind === 'literal') return JSON.stringify(node.value)
  if (node.kind === 'property') return node.path
  if (node.kind === 'fallback')
    return `${expressionSource(node.left)} ?? ${expressionSource(node.right)}`
  return `${node.name}(${node.args.map(expressionSource).join(', ')})`
}

/** Expose constituent fields, including nested fallbacks and optional fragments.
 * @param node Parsed component. @param path Internal field address. @param label Field context.
 * @returns Editable property and literal leaves in source order.
 */
export function componentFields(
  node: TemplateExpression,
  path: number[] = [],
  label = 'Property',
): TemplateComponentField[] {
  if (node.kind === 'property' || node.kind === 'literal')
    return [
      {
        path,
        kind: node.kind,
        label,
        value: node.kind === 'property' ? node.path : node.value,
      },
    ]
  if (node.kind === 'fallback')
    return [
      ...componentFields(node.left, [...path, 0], label),
      ...componentFields(node.right, [...path, 1], 'Fallback'),
    ]
  const labels =
    node.name === 'pair' || node.name === 'join'
      ? ['First property', 'Second property', 'Separator']
      : node.name === 'optional'
        ? ['Property', 'Prefix', 'Suffix']
        : ['Property', 'True / present', 'False', 'Missing']
  return node.args.flatMap((arg, index) =>
    componentFields(arg, [...path, index], labels[index]),
  )
}

/** Replace one constituent while retaining the rest of the expression tree.
 * @param node Parsed component. @param path Field address. @param value New property path or literal.
 * @returns Updated expression tree.
 */
export function updateComponentField(
  node: TemplateExpression,
  path: number[],
  value: string,
): TemplateExpression {
  if (!path.length) {
    if (node.kind === 'property') return { ...node, path: value }
    if (node.kind === 'literal') return { ...node, value }
    return node
  }
  const [index, ...rest] = path
  if (node.kind === 'fallback')
    return index === 0
      ? { ...node, left: updateComponentField(node.left, rest, value) }
      : { ...node, right: updateComponentField(node.right, rest, value) }
  if (node.kind === 'call')
    return {
      ...node,
      args: node.args.map((arg, i) =>
        i === index ? updateComponentField(arg, rest, value) : arg,
      ),
    }
  return node
}
