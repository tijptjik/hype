// NODE
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
// SQLITE
import { Database } from 'bun:sqlite'
// ROUTING
import {
  calculateMtrAccess,
  mtrFeaturePoint,
  mtrRouteDistance,
  mtrCatalog,
  MTR_POLICY_VERSION,
  MTR_MAX_WALKING_METRES,
  type MtrAccess,
} from '../src/lib/routing/mtr'

/** Quotes a SQLite string. @param value - Text or null. @returns SQL literal. */
function sql(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
}

/**
 * Computes walking access locally and emits a reviewable, resumable data migration.
 * @param args - Explicit --database, --endpoint, --graph and --output paths/identity.
 * @returns Nothing after the complete SQL plan and count-only receipt are written.
 * @remarks Never writes the input database or calls production routing. Checkpoints
 * include policy/graph/catalog/geometry identity; failed calculations abort unless --allow-partial explicitly retains failed jobs.
 */
export async function backfillFeatureMtr(args: string[]): Promise<void> {
  process.umask(0o077)
  const option = (key: string): string => {
    const value = args[args.indexOf(key) + 1]
    if (!args.includes(key) || !value) throw new Error(`Missing ${key}`)
    return value
  }
  const output = option('--output'),
    graph = option('--graph'),
    endpoint = new URL(option('--endpoint'))
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
    throw new Error('Backfill requires a local routing engine')
  const db = new Database(option('--database'), { readonly: true })
  const rows = db.query("SELECT id,geometry FROM feature WHERE json_extract(COALESCE(mtrResolution,'{}'),'$.review') IS NULL ORDER BY id").all() as {
    id: string
    geometry: string
  }[]
  mkdirSync(dirname(output), { recursive: true })
  const checkpoint = output + '.checkpoint.jsonl'
  const cache = new Map<string, MtrAccess>()
  if (existsSync(checkpoint))
    for (const line of readFileSync(checkpoint, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)) {
      const row = JSON.parse(line)
      cache.set(row.key, row.result)
    }
  const results = new Map<string, MtrAccess>()
  const failures: string[] = []
  let done = 0,
    index = 0,
    requests = 0
  // Reviewed imports are excluded; geometry changes clear their approval via the schema trigger.
  // Four independent features share a local two-thread native engine without flooding it.
  async function worker(): Promise<void> {
    while (index < rows.length) {
      const row = rows[index++]
      const key = createHash('sha256')
        .update(
          JSON.stringify([MTR_POLICY_VERSION, graph, mtrCatalog.sourceSha256, row.geometry]),
        )
        .digest('hex')
      let result = cache.get(key)
      try {
        if (!result) {
          result = await calculateMtrAccess(
            mtrFeaturePoint(JSON.parse(row.geometry)),
            async (origin, exit) => {
              requests++
              const response = await fetch(new URL('/route', endpoint), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  locations: [
                    { lon: origin[0], lat: origin[1] },
                    { lon: exit.coordinates[0], lat: exit.coordinates[1] },
                  ],
                  costing: 'pedestrian',
                  directions_options: { units: 'kilometers' },
                  directions_type: 'none',
                }),
                signal: AbortSignal.timeout(30000),
              })
              if (response.status >= 500) {
                writeFileSync(
                  output + '.failed-request.json',
                  JSON.stringify({
                    locations: [
                      { lon: origin[0], lat: origin[1] },
                      { lon: exit.coordinates[0], lat: exit.coordinates[1] },
                    ],
                    costing: 'pedestrian',
                  }),
                  { mode: 0o600 },
                )
                throw new Error(
                  `Local routing engine failed: ${response.status} ${(await response.text()).slice(0, 500)}`,
                )
              }
              return mtrRouteDistance(
                await response.json(),
                origin,
                exit.coordinates as [number, number],
              )
            },
            graph,
          )
          cache.set(key, result)
          appendFileSync(checkpoint, JSON.stringify({ key, result }) + '\n', {
            mode: 0o600,
          })
        }
        results.set(row.id, result)
      } catch (error) {
        if (!args.includes('--allow-partial')) throw error
        failures.push(row.id)
      }
      done++
      if (done % 100 === 0)
        console.log(JSON.stringify({ completed: done, total: rows.length, requests }))
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  const statements = [
    '-- Core MTR walking-access data migration. Requires schema 0096 and feature import.',
  ]
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const result = results.get(row.id)
    if (!result) continue
    counts[result.mtrResolution.status] = (counts[result.mtrResolution.status] || 0) + 1
    statements.push(
      `UPDATE feature SET mtrStation=${sql(result.mtrStation)},mtrExit=${sql(result.mtrExit)},mtrDistance=${result.mtrDistance ?? 'NULL'},mtrResolution=${sql(JSON.stringify(result.mtrResolution))} WHERE id=${sql(row.id)} AND geometry=${sql(row.geometry)} AND json_extract(COALESCE(mtrResolution,'{}'),'$.review') IS NULL;`,
    )
    statements.push(
      `DELETE FROM featureMtrJob WHERE featureId=${sql(row.id)} AND geometry=${sql(row.geometry)};`,
    )
  }
  writeFileSync(output, statements.join('\n') + '\n', { mode: 0o600 })
  writeFileSync(
    output + '.receipt.json',
    JSON.stringify(
      {
        features: rows.length,
        completed: results.size,
        failed: failures.length,
        counts,
        requests,
        graph,
        catalog: mtrCatalog.sourceSha256,
        policy: MTR_POLICY_VERSION,
        maxWalkingMetres: MTR_MAX_WALKING_METRES,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
  writeFileSync(output + '.failures.json', JSON.stringify(failures), { mode: 0o600 })
  db.close()
  console.log(
    JSON.stringify({
      features: rows.length,
      completed: results.size,
      failed: failures.length,
      counts,
      requests,
      output,
    }),
  )
}
if (import.meta.main) await backfillFeatureMtr(process.argv.slice(2))
