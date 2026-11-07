// NODE
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const output = resolve('.svelte-kit/output/client')
const generated = resolve('.svelte-kit/generated/build/client-optimized/nodes')
type Entry = {
  file: string
  name?: string
  imports?: string[]
  dynamicImports?: string[]
}
const manifest: Record<string, Entry> = JSON.parse(
  readFileSync(resolve(output, '.vite/manifest.json'), 'utf8'),
)
const included = new Set<string>()

/** Collects the synchronous public route graph, leaving intent-loaded panels out.
 * @param key Manifest entry identity.
 * @returns Nothing; records each dependency once.
 */
function collect(key: string): void {
  if (included.has(key)) return
  if (!manifest[key]) throw new Error(`Missing manifest entry: ${key}`)
  included.add(key)
  for (const dependency of manifest[key].imports ?? []) collect(dependency)
}

for (const route of [
  'src/routes/+layout.svelte',
  'src/routes/(public)/+layout.svelte',
  'src/routes/(public)/(app)/+layout.svelte',
  'src/routes/(public)/(app)/+page.svelte',
]) {
  const node = readdirSync(generated).find(file =>
    readFileSync(resolve(generated, file), 'utf8').includes(`/${route}"`),
  )
  if (!node) throw new Error(`Missing generated route: ${route}`)
  const key = Object.keys(manifest).find(key => key.endsWith(`/nodes/${node}`))
  if (!key) throw new Error(`Missing production route: ${route}`)
  collect(key)
}
const entries = [...included].map(key => manifest[key])
const deferred = [
  'StarsPanel',
  'HubPanel',
  'FiltersPanel',
  'NavigationPanel',
  'ResourcePanel',
]
const eagerPanels = entries.filter(entry => deferred.includes(entry.name ?? ''))
const files = [
  ...new Set(entries.map(entry => entry.file).filter(file => file.endsWith('.js'))),
]
const bytes = files.map(file => readFileSync(resolve(output, file)))
console.log(
  JSON.stringify(
    {
      route: '/',
      files: files.length,
      bytes: bytes.reduce((sum, file) => sum + file.length, 0),
      gzipBytes: bytes.reduce((sum, file) => sum + gzipSync(file).length, 0),
      eagerPanels: eagerPanels.map(entry => entry.name),
    },
    null,
    2,
  ),
)
if (eagerPanels.length)
  throw new Error('Closed public panels reached the synchronous startup graph')
