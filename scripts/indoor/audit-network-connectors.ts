// NODE
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// DOMAIN
import {
  loadNetworkAnnotations,
  networkAnnotation,
  networkConnections,
} from '../../src/lib/indoor/networkAnnotations'
import { validateMapBundle, mapHash } from '../../src/lib/indoor/releases'
import manifest from '../../src/lib/indoor/network-connectors/manifest.json'

/** Audit actual retained published bundles, including authored corrections, without changing them.
 * @param directory Captured input directory. @returns Per-station receipt saved beside the inputs.
 */
async function audit(directory: string): Promise<void> {
  const inputs = JSON.parse(readFileSync(join(directory, 'inputs.json'), 'utf8')) as {
    code: keyof typeof manifest
    hash: string
  }[]
  const rows = []
  for (const input of inputs) {
    const raw = readFileSync(join(directory, 'bundles', `${input.code}.json`), 'utf8')
    assert.equal(await mapHash(raw), input.hash)
    const { data } = validateMapBundle(JSON.parse(raw))
    await loadNetworkAnnotations(data)
    const matched = data.unit_polygon.features.filter(unit =>
      networkAnnotation(data, unit),
    )
    assert.equal(matched.length, manifest[input.code].annotated, input.code)
    const connections = networkConnections(data)
    for (const c of connections) {
      assert(
        !data.connections?.some(
          saved =>
            (saved.from === c.from && saved.to === c.to) ||
            (saved.from === c.to && saved.to === c.from),
        ),
      )
    }
    rows.push({
      code: input.code,
      matched: matched.length,
      addedPairs: connections.length,
      existingPairs: data.connections?.length ?? 0,
    })
  }
  const result = {
    stations: rows.length,
    matched: rows.reduce((n, r) => n + r.matched, 0),
    addedPairs: rows.reduce((n, r) => n + r.addedPairs, 0),
    rows,
  }
  writeFileSync(join(directory, 'audit.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(
    JSON.stringify({
      stations: result.stations,
      matched: result.matched,
      addedPairs: result.addedPairs,
    }),
  )
}
await audit(process.argv[2])
