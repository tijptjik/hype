// NODE
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { validateMapBundle } from '../../src/lib/indoor/releases'

const root = resolve(process.argv[2])
const manifest = JSON.parse(readFileSync(resolve(root, 'upload-manifest.json'), 'utf8'))
const collection = JSON.parse(readFileSync(resolve(root, 'collection.json'), 'utf8'))
if (
  !manifest.ready ||
  collection.complete !== collection.expected ||
  collection.failures.length
)
  throw new Error('Incomplete baseline')
const expectedPaths = new Set<string>([
  'upload-manifest.json',
  ...manifest.objects.map((entry: { path: string }) => entry.path),
])
const actualPaths = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => resolve(entry.parentPath, entry.name).slice(root.length + 1))
if (
  actualPaths.length !== expectedPaths.size ||
  actualPaths.some(path => !expectedPaths.has(path))
)
  throw new Error('Baseline file inventory changed')
// Verify exact bytes before validating the uncorrected source bundles.
for (const entry of manifest.objects) {
  const path = resolve(root, entry.path)
  if (!path.startsWith(`${root}/`)) throw new Error('Invalid manifest path')
  const bytes = readFileSync(path)
  if (
    bytes.length !== entry.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== entry.sha256
  )
    throw new Error(`Source checksum mismatch: ${entry.path}`)
}
const index = JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf8'))
if (
  index.length !== collection.expected ||
  new Set(index.map((entry: { code: string }) => entry.code)).size !== index.length
)
  throw new Error('Incomplete or duplicate station index')
const failures: { code: string; error: string }[] = []
for (const entry of index) {
  try {
    const bundlePath = resolve(root, 'stations', entry.code, 'bundle.json')
    if (!bundlePath.startsWith(`${root}/stations/`))
      throw new Error('Invalid station path')
    validateMapBundle(JSON.parse(readFileSync(bundlePath, 'utf8')))
  } catch (error) {
    failures.push({ code: entry.code, error: String(error) })
  }
}
console.log(
  JSON.stringify(
    {
      stations: index.length,
      objects: manifest.objects.length,
      bytes: manifest.totalBytes,
      failures,
    },
    null,
    2,
  ),
)
if (failures.length) process.exitCode = 1
