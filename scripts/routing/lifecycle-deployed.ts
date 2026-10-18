// RUNTIME
import { parseArgs } from 'node:util'

// TOC: Contracts | Deployed lifecycle assertions
type Result = {
  ready?: boolean
  state?: { status: string; lastChange: number }
  native?: { trip?: { status: number } }
}

/**
 * Exercises real deployed readiness, startup races and idle expiry.
 * @returns Completion after assertions and timestamped evidence are persisted.
 * @remarks Run alone: other callers deliberately reset the shared idle deadline.
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
        default: 'build/routing-benchmark/deployed-native-lifecycle.json',
      },
    },
  })
  const token = process.env.BENCHMARK_TOKEN
  if (!token) throw new Error('BENCHMARK_TOKEN required')
  const events: unknown[] = []
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const route = {
    locations: [
      { lat: 22.2819, lon: 114.1589 },
      { lat: 22.2865, lon: 114.15 },
    ],
    costing: 'pedestrian',
  }

  /**
   * Records complete request timings without credentials.
   * @param path - Authenticated endpoint path.
   * @param method - HTTP method.
   * @param body - Optional route payload.
   * @returns Parsed readiness, route or state response.
   */
  async function call(path: string, method = 'POST', body?: unknown): Promise<Result> {
    const start = performance.now()
    const response = await fetch(`${values.endpoint}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })
    const result = (await response.json()) as Result
    const event = {
      at: new Date().toISOString(),
      path,
      status: response.status,
      elapsedMs: performance.now() - start,
      result,
    }
    events.push(event)
    await Bun.write(
      values.output!,
      JSON.stringify(
        { scope: '3 GiB deployed intent warm-up and 120 second idle policy', events },
        null,
        2,
      ) + '\n',
    )
    console.log(
      JSON.stringify({
        ...event,
        result: {
          ...result,
          native: result.native
            ? { trip: { status: result.native.trip?.status } }
            : undefined,
        },
      }),
    )
    if (!response.ok) throw new Error(`${path}: ${response.status}`)
    return result
  }

  /**
   * Asserts a passive state read without warming the engine.
   * @param stopped - Whether the engine must be stopped.
   * @returns Completion after the state assertion.
   */
  async function state(stopped: boolean): Promise<void> {
    const result = await call('/state', 'GET')
    const isStopped = ['stopped', 'stopped_with_code'].includes(
      result.state?.status ?? '',
    )
    const isRunning = ['healthy', 'running'].includes(result.state?.status ?? '')
    if (isStopped !== stopped || (!stopped && !isRunning))
      throw new Error(`Unexpected state: ${JSON.stringify(result)}`)
  }

  await call('/stop')
  await state(true)
  // Concurrent readiness calls and a route must safely share the cold engine.
  const results = await Promise.all([
    call('/warmup'),
    call('/warmup'),
    call('/route', 'POST', route),
  ])
  if (!results[0].ready || !results[1].ready || results[2].native?.trip?.status !== 0)
    throw new Error('Startup race failed')
  await state(false)
  await Bun.sleep(60000)
  await call('/route', 'POST', route)
  // The route resets expiry beyond the original warm-up deadline.
  await Bun.sleep(60000)
  await state(false)
  await Bun.sleep(15000)
  await state(false)
  await Bun.sleep(55000)
  await state(true)
  // An abandoned warm-up must also expire; passive polls cannot extend it.
  await call('/warmup')
  await Bun.sleep(60000)
  await state(false)
  await Bun.sleep(60000)
  await Bun.sleep(10000)
  await state(true)
  const coldRoute = await call('/route', 'POST', route)
  if (coldRoute.native?.trip?.status !== 0)
    throw new Error('Route without warm-up failed')
  await call('/stop')
  await state(true)
  console.log('Lifecycle assertions passed')
}

if (import.meta.main) await main()
