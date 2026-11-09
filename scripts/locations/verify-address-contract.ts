// NODE
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// TYPESCRIPT
import ts from 'typescript'
// DOMAIN
import {
  LocalAddressI18nSchema,
  LocalAddressUnitSchema,
  LocalAddressUnitI18nSchema,
  LocalLocationAddressSchema,
  ADDRESS_BLOCK_TYPES,
  ADDRESS_SCOPES,
  ADDRESS_UNIT_TYPES,
  ADDRESS_FLOOR_TYPES,
} from '../../src/lib/addresses/localLocationAddress'

const sourceRoot = resolve(process.argv[2] ?? '../saanseoi')
/** Read upstream declarations without executing sibling-project code. @param file Relative source path. @returns Parsed source. */
function source(file: string): ts.SourceFile {
  const path = resolve(sourceRoot, file)
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
}
/** Find a named declaration. @param file Parsed source. @param name Declaration name. @returns Declaration node or fail. */
function declaration(file: ts.SourceFile, name: string): ts.Node {
  let result: ts.Node | undefined
  const visit = (node: ts.Node): void => {
    if (
      'name' in node &&
      node.name &&
      ts.isIdentifier(node.name as ts.Node) &&
      (node.name as ts.Identifier).text === name
    )
      result = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(result, `Missing upstream declaration ${name}`)
  return result
}
/** Extract a canonical column/type field list. @param node Declaration. @returns Ordered property names. */
function keys(node: ts.Node): string[] {
  let result: string[] = []
  const visit = (child: ts.Node): void => {
    if (ts.isObjectLiteralExpression(child))
      result = child.properties.flatMap(p =>
        p.name && ts.isIdentifier(p.name) ? [p.name.text] : [],
      )
    else if (ts.isTypeLiteralNode(child))
      result = child.members.flatMap(p =>
        p.name && ts.isIdentifier(p.name) ? [p.name.text] : [],
      )
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return result
}
/** Compare retained content keys while documenting identity/provenance exclusions. */
function sameKeys(
  actual: Record<string, unknown>,
  upstream: string[],
  excluded: string[],
  extra: string[] = [],
): void {
  assert.deepEqual(
    Object.keys(actual).sort(),
    [...upstream.filter(k => !excluded.includes(k)), ...extra].sort(),
  )
}
const shared = source('libs/db/src/schema/shared.ts')
const units = source('libs/db/src/address3d.ts')
sameKeys(
  LocalAddressI18nSchema.shape,
  keys(declaration(shared, 'canonicalAddress2dI18nColumns')),
  ['addressId', 'locale', 'meta'],
)
sameKeys(
  LocalLocationAddressSchema.shape,
  keys(declaration(shared, 'canonicalAddress2dColumns')),
  ['id', 'sources'],
  ['i18n', 'unit', 'unitI18n'],
)
sameKeys(LocalAddressUnitSchema.shape, keys(declaration(units, 'Address3dUnit')), [
  'id',
])
sameKeys(
  LocalAddressUnitI18nSchema.shape,
  keys(declaration(units, 'Address3dUnitI18n')),
  [],
)
for (const [file, name, values] of [
  [source('libs/address/src/content.ts'), 'ADDRESS_BLOCK_TYPES', ADDRESS_BLOCK_TYPES],
  [source('libs/address/src/content.ts'), 'ADDRESS_SCOPES', ADDRESS_SCOPES],
  [source('libs/address/src/content.ts'), 'ADDRESS_UNIT_TYPES', ADDRESS_UNIT_TYPES],
  [source('libs/address/src/content.ts'), 'ADDRESS_FLOOR_TYPES', ADDRESS_FLOOR_TYPES],
] as const) {
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node)) found.push(node.text)
    else ts.forEachChild(node, visit)
  }
  visit(declaration(file, name))
  assert.deepEqual([...values], found, name)
}
console.log(
  'Verified SaanSeoi 2D/3D content keys and all four address enum vocabularies; identity and provenance exclusions are explicit.',
)
