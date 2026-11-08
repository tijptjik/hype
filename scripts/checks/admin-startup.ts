// NODE
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

// Inspect actual production route entries; development node numbers are different.
const output = resolve('.svelte-kit/output/client')
const generated = resolve('.svelte-kit/generated/build/client-optimized/nodes')
type Entry = { file: string; name?: string; imports?: string[] }
const manifest: Record<string, Entry> = JSON.parse(
  readFileSync(resolve(output, '.vite/manifest.json'), 'utf8'),
)
const detailPages = process.argv.includes('--details')
const resources = detailPages
  ? [
      'features/[feature]',
      'projects/[project]',
      'layers/[layer]',
      'hubs/[hub]',
      'organisations/[organisation]',
      'tasks/[task]',
    ]
  : ['features', 'projects', 'layers', 'hubs', 'organisations']
const budget = detailPages ? 5_000_000 : 2_500_000
const included = new Set<string>()

/** Collect only synchronous dependencies, excluding maps behind dynamic imports.
 * @param key Production manifest entry key.
 * @returns Nothing; adds each dependency once to the included set.
 */
function collect(key: string): void {
  if (included.has(key)) return
  if (!manifest[key]) throw new Error(`Missing manifest entry: ${key}`)
  included.add(key)
  for (const dependency of manifest[key].imports ?? []) collect(dependency)
}

for (const resource of resources) {
  included.clear()
  const routes = [
    'src/routes/+layout.svelte',
    'src/routes/admin/+layout.svelte',
    `src/routes/admin/${resource}/+page.svelte`,
  ]
  for (const route of routes) {
    const node = readdirSync(generated).find(file =>
      readFileSync(resolve(generated, file), 'utf8').includes(`/${route}"`),
    )
    if (!node) throw new Error(`Missing generated route: ${route}`)
    const key = Object.keys(manifest).find(key => key.endsWith(`/nodes/${node}`))
    if (!key) throw new Error(`Missing production route: ${route}`)
    collect(key)
  }

  const entries = [...included].map(key => manifest[key])
  const eagerMaps = entries.filter(entry =>
    /^(?:maplibre-gl|MapCanvas|MapSurface|Maplet)$/.test(entry.name ?? ''),
  )
  const files = [
    ...new Set(entries.map(entry => entry.file).filter(file => file.endsWith('.js'))),
  ]
  const bytes = files.map(file => readFileSync(resolve(output, file)))
  console.log(
    JSON.stringify(
      {
        route: `/admin/${resource}`,
        files: files.length,
        bytes: bytes.reduce((sum, file) => sum + file.length, 0),
        gzipBytes: bytes.reduce((sum, file) => sum + gzipSync(file).length, 0),
        eagerMaps: eagerMaps.map(entry => entry.name),
      },
      null,
      2,
    ),
  )
  if (eagerMaps.length)
    throw new Error('Admin startup must not eagerly import a map renderer')

  // Keep an explicit ceiling below the former 5 MB barrel-import dependency graph.
  if (bytes.reduce((sum, file) => sum + file.length, 0) > budget)
    throw new Error(
      `Admin ${resource} startup exceeds the ${budget / 1_000_000} MB uncompressed budget`,
    )
}
