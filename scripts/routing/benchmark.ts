// RUNTIME
import { parseArgs } from 'node:util'
// TOC: Contracts | Timing | Runner

type Sample = {
  engine: string
  phase: string
  caseId: string
  mode: string
  elapsedMs: number
  status: number
  ok: boolean
  result: unknown
}
type Case = {
  id: string
  from: [number, number]
  to: [number, number]
  modes: string[]
}

/**
 * Returns a nearest-rank percentile of successful full-response client timings.
 * @param values - Observed response times.
 * @param fraction - Percentile in the range zero to one.
 * @returns The percentile, or null when no successful response exists.
 */
function percentile(values: number[], fraction: number): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
    : null
}

/**
 * Measures both routing backends with an identical uncached request corpus.
 * @returns Completion after writing raw samples and grouped p50/p95 timings.
 * @remarks The first sweep is first-use, not proof of an evicted Cloudflare isolate.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      native: { type: 'string' },
      wasm: { type: 'string' },
      output: { type: 'string' },
      repetitions: { type: 'string', default: '10' },
      modes: { type: 'string' },
      concurrency: { type: 'string', default: '4,8' },
    },
  })
  if (!values.output) throw new Error('--output required')
  const token = process.env.BENCHMARK_TOKEN
  if (!token) throw new Error('BENCHMARK_TOKEN required')
  const cases: Case[] = await Bun.file(new URL('./cases.json', import.meta.url)).json()
  if (values.modes) for (const test of cases) test.modes = values.modes.split(',')
  const samples: Sample[] = []
  const backends = Object.entries({ native: values.native, wasm: values.wasm }).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  )
  if (!backends.length) throw new Error('--native or --wasm required')
  /** Measure the full body and retain failures instead of filtering them from the evidence. */
  async function measure(
    engine: string,
    url: string,
    test: Case,
    mode: string,
    phase: string,
  ): Promise<void> {
    const started = performance.now()
    try {
      const response = await fetch(`${url}/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locations: [
            { lat: test.from[0], lon: test.from[1] },
            { lat: test.to[0], lon: test.to[1] },
          ],
          costing: mode,
        }),
        signal: AbortSignal.timeout(90000),
      })
      const responseText = await response.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = { error: responseText.slice(0, 1024) }
      }
      const body = parsed as {
        native?: {
          trip?: {
            status?: number
            summary?: unknown
            legs?: { shape: string; maneuvers: unknown[] }[]
          }
        }
        trip?: {
          status?: number
          summary?: unknown
          legs?: { shape: string; maneuvers: unknown[] }[]
        }
        error?: unknown
        diagnostics?: unknown
        benchmark?: unknown
      }
      const elapsedMs = performance.now() - started
      const native = body.native ?? body
      const trip = native.trip
      const result = {
        summary: trip?.summary,
        shapeSha256: trip?.legs
          ? new Bun.CryptoHasher('sha256')
              .update(JSON.stringify(trip.legs.map(leg => leg.shape)))
              .digest('hex')
          : null,
        maneuverCount: trip?.legs?.reduce((sum, leg) => sum + leg.maneuvers.length, 0),
        diagnostics: body.diagnostics,
        benchmark: body.benchmark,
        error: body.error ?? ('error' in native ? native.error : undefined),
        nativeErrorCode: 'error_code' in native ? native.error_code : undefined,
      }
      samples.push({
        engine,
        phase,
        caseId: test.id,
        mode,
        elapsedMs,
        status: response.status,
        ok: response.ok && trip?.status === 0,
        result,
      })
    } catch (error) {
      samples.push({
        engine,
        phase,
        caseId: test.id,
        mode,
        elapsedMs: performance.now() - started,
        status: 0,
        ok: false,
        result: { error: String(error) },
      })
    }
    // Persist each sample so an interruption cannot erase successful or failed requests.
    await Bun.write(
      values.output!,
      JSON.stringify({ startedAt, samples }, null, 2) + '\n',
    )
  }
  const startedAt = new Date().toISOString()
  for (const [engine, url] of backends) {
    for (const test of cases)
      for (const mode of test.modes) await measure(engine, url, test, mode, 'first-use')
  }
  for (let repeat = 0; repeat < Number(values.repetitions); repeat++) {
    for (const test of cases)
      for (const mode of test.modes)
        for (const [engine, url] of backends)
          await measure(engine, url, test, mode, 'warm')
  }
  for (const concurrency of values
    .concurrency!.split(',')
    .map(Number)
    .filter(n => n > 0)) {
    for (const [engine, url] of backends) {
      for (let repeat = 0; repeat < 3; repeat++)
        await Promise.all(
          Array.from({ length: concurrency }, (_, index) =>
            measure(
              engine,
              url,
              cases[index % cases.length],
              'pedestrian',
              `concurrent-${concurrency}`,
            ),
          ),
        )
    }
  }
  const summary = [
    ...new Set(samples.map(s => `${s.engine}|${s.phase}|${s.mode}`)),
  ].map(key => {
    const [engine, phase, mode] = key.split('|')
    const group = samples.filter(
      s => s.engine === engine && s.phase === phase && s.mode === mode,
    )
    const timings = group.filter(s => s.ok).map(s => s.elapsedMs)
    return {
      engine,
      phase,
      mode,
      total: group.length,
      success: timings.length,
      p50Ms: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      maxMs: timings.length ? Math.max(...timings) : null,
    }
  })
  const output = {
    startedAt,
    finishedAt: new Date().toISOString(),
    client: 'Bun fetch; full JSON response body; no route-result cache',
    summary,
    samples,
  }
  await Bun.write(values.output, JSON.stringify(output, null, 2) + '\n')
  console.table(summary)
}

if (import.meta.main) await main()
