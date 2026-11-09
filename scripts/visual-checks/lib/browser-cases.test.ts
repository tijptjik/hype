// TESTS
import { expect, test } from 'bun:test'
// TYPES
import type { Browser, LaunchOptions } from 'playwright'
// RUNNER
import { browserCases } from './browser-cases'

/** Build engines that record resource ownership without spawning browser processes. */
function fixture(): {
  events: string[]
  options: LaunchOptions[]
  engines: Parameters<typeof browserCases>[1]
} {
  const events: string[] = []
  const options: LaunchOptions[] = []
  const engine = (name: string) => ({
    async launch(value?: LaunchOptions): Promise<Browser> {
      events.push(`launch:${name}`)
      options.push(value ?? {})
      return {
        async close(): Promise<void> {
          events.push(`close:${name}`)
        },
      } as Browser
    },
  })
  return {
    events,
    options,
    engines: { chromium: engine('chromium'), firefox: engine('firefox') },
  }
}

test('closes each engine before launching the next and confines map flags to Chromium', async () => {
  const f = fixture()
  for await (const { name } of browserCases({ map: true }, f.engines))
    f.events.push(`scenario:${name}`)
  expect(f.events).toEqual([
    'launch:chromium',
    'scenario:chromium',
    'close:chromium',
    'launch:firefox',
    'scenario:firefox',
    'close:firefox',
  ])
  expect(f.options).toEqual([
    { headless: true, args: ['--disable-web-security'] },
    { headless: true },
  ])
})

test('a failing scenario closes its browser and propagates the original failure', async () => {
  const f = fixture()
  const failure = new Error('scenario failed')
  const run = async () => {
    for await (const _case of browserCases({}, f.engines)) throw failure
  }
  await expect(run()).rejects.toBe(failure)
  expect(f.events).toEqual(['launch:chromium', 'close:chromium'])
})

test('early termination closes the selected browser without launching excluded engines', async () => {
  const f = fixture()
  for await (const _case of browserCases({ only: 'firefox' }, f.engines)) break
  expect(f.events).toEqual(['launch:firefox', 'close:firefox'])
  expect(f.options).toEqual([{ headless: true }])
})

test('launch failure aborts before later engines and does not attempt a nonexistent close', async () => {
  const f = fixture()
  const failure = new Error('launch failed')
  const run = async () => {
    for await (const _case of browserCases(
      {},
      {
        ...f.engines!,
        chromium: {
          launch: async () => {
            throw failure
          },
        },
      },
    ))
      throw new Error('Should not yield')
  }
  await expect(run()).rejects.toBe(failure)
  expect(f.events).toEqual([])
})
