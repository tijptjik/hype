/** Give every Durable Object its own WASM memory, JS handles, and task queue.
 * wasm-bindgen's web target normally emits a singleton. Generate a static
 * factory instead; Workers never evaluates generated source at runtime.
 */
import ts from 'typescript'

const path = new URL('../dist/whatsapp_engine.js', import.meta.url)
const source = await Bun.file(path).text()
const file = ts.createSourceFile(
  'bindings.js',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
)
const imports: string[] = []
const body: string[] = []
const exports: string[] = []
for (const statement of file.statements) {
  const text = statement.getFullText(file)
  if (ts.isImportDeclaration(statement)) {
    imports.push(text)
    continue
  }
  if (ts.isExportDeclaration(statement)) {
    if (!/export \{ initSync, __wbg_init as default \};/.test(text))
      throw new Error('wasm-bindgen export format changed')
    continue
  }
  if (
    ts.canHaveModifiers(statement) &&
    ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    if (
      (!ts.isFunctionDeclaration(statement) && !ts.isClassDeclaration(statement)) ||
      !statement.name
    )
      throw new Error('unsupported wasm-bindgen export')
    exports.push(statement.name.text)
    body.push(text.replace(/\bexport\s+(?=(?:async\s+)?(?:function|class)\s)/, ''))
  } else {
    body.push(text)
  }
}
if (!exports.includes('probeRuntime') || !exports.includes('validateTextRequest'))
  throw new Error('required WASM exports missing')
await Bun.write(
  new URL('../dist/factory.js', import.meta.url),
  `${imports.join('\n')}\nexport function instantiateEngine(module) {\n${body.join('\n')}\nconst low = initSync({ module });\nreturn { ${exports.join(', ')}, memory: low.memory };\n}\n`,
)
await Bun.write(
  new URL('../dist/factory.d.ts', import.meta.url),
  `import type * as Engine from './whatsapp_engine.js';\nexport type EngineHost = Pick<typeof Engine, ${exports.map(n => JSON.stringify(n)).join(' | ')}> & { memory: WebAssembly.Memory };\nexport declare function instantiateEngine(module: WebAssembly.Module): EngineHost;\n`,
)
