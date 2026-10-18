// RUNTIME
import { parseArgs } from 'node:util'

/**
 * Measures routes after explicitly stopping the deployed native container.
 * @returns Completion after persisting full client timings and route outcomes.
 * @remarks Shutdown time is recorded separately and excluded from route latency.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      endpoint: {
        type: 'string',
        default: 'https://hype-routing-native-benchmark.hypehk.workers.dev',
      },
      output: {
        type: 'string',
        default: 'build/routing-benchmark/deployed-native-cold.json',
      },
      repetitions: { type: 'string', default: '5' },
    },
  })
  const token = process.env.BENCHMARK_TOKEN
  if (!token) throw new Error('BENCHMARK_TOKEN required')
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const samples: unknown[] = []
  const startedAt = new Date().toISOString()
  for (let index = 0; index < Number(values.repetitions); index++) {
    const shutdownStart = performance.now()
    const stopped = await fetch(`${values.endpoint}/stop`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60000),
    })
    const stopBody = await stopped.text()
    if (!stopped.ok)
      throw new Error(`Stop failed: ${stopped.status} ${stopBody.slice(0, 200)}`)
    const stopResult = JSON.parse(stopBody) as {
      stopped?: boolean
      state?: { status: string }
    }
    if (
      !stopResult.stopped ||
      !['stopped', 'stopped_with_code'].includes(stopResult.state?.status ?? '')
    ) {
      throw new Error(`Container was not verified stopped: ${stopBody}`)
    }
    const shutdownMs = performance.now() - shutdownStart
    const routeStart = performance.now()
    const response = await fetch(`${values.endpoint}/route`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locations: [
          { lat: 22.2819, lon: 114.1589 },
          { lat: 22.2865, lon: 114.15 },
        ],
        costing: 'pedestrian',
      }),
      signal: AbortSignal.timeout(90000),
    })
    const text = await response.text()
    const elapsedMs = performance.now() - routeStart
    let body: {
      native?: { trip?: { status: number; summary: unknown } }
      benchmark?: unknown
      error?: unknown
    }
    try {
      body = JSON.parse(text)
    } catch {
      body = { error: text.slice(0, 1000) }
    }
    const sample = {
      shutdownMs,
      stopState: stopResult.state,
      elapsedMs,
      status: response.status,
      ok: response.ok && body.native?.trip?.status === 0,
      summary: body.native?.trip?.summary,
      benchmark: body.benchmark,
      error: body.error,
    }
    samples.push(sample)
    await Bun.write(
      values.output!,
      JSON.stringify(
        {
          startedAt,
          scope:
            'Deployed native route after verified container.destroy(); shutdown excluded',
          samples,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(JSON.stringify(sample))
  }
}

if (import.meta.main) await main()
