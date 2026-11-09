// TESTS
import { expect, test } from 'bun:test'
// NODE
import { existsSync } from 'node:fs'
// RUNNER
import { selectChecks } from './run'
import { visualSuites } from './lib/suites'

test('rejects an empty or invalid selection before running any scenarios', () => {
  expect(() => selectChecks([])).toThrow('Choose a suite')
  expect(() => selectChecks(['messaging', 'missing'])).toThrow('Unknown suite or check')
  expect(() => selectChecks(['toString'])).toThrow('Unknown suite or check')
})

test('overlapping suite and individual selections run each scenario only once', () => {
  const first = visualSuites.messaging[0]
  expect(selectChecks([first + '.ts', 'messaging', first])).toEqual([
    ...visualSuites.messaging,
  ])
})

test('every suite entry is unique and points to an existing standalone runner', () => {
  const checks = Object.values(visualSuites).flat()
  expect(new Set(checks).size).toBe(checks.length)
  for (const check of checks)
    expect(existsSync(new URL(`./${check}.ts`, import.meta.url))).toBe(true)
})
