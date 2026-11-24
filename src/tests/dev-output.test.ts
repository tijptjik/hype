import { expect, it } from 'vitest'
import { getDevOutput, getParaglideOutput } from '../../scripts/dev/output'

it('keeps main development and builds on the canonical output', () => {
  expect(getDevOutput([], 'serve').outDir).toBe('.svelte-kit')
  expect(getDevOutput(['--port', '5175'], 'serve').outDir).toBe('.svelte-kit')
  expect(getDevOutput(['--port', '4173'], 'build').outDir).toBe('.svelte-kit')
})

it('isolates explicit check-server ports and watches only their generated output', () => {
  const result = getDevOutput(['--port', '4173'], 'serve')
  expect(result.outDir).toBe('.svelte-kit/dev-4173')
  expect(getDevOutput(['--port=4174'], 'serve').outDir).toBe('.svelte-kit/dev-4174')
  const ignore = result.ignored[0]
  expect(ignore.test('/repo/.svelte-kit/generated/dev/server.js')).toBe(true)
  expect(ignore.test('/repo/.svelte-kit/dev-4174/generated/dev/server.js')).toBe(true)
  expect(ignore.test('/repo/.svelte-kit/dev-4173/generated/dev/server.js')).toBe(false)
  expect(ignore.test('/repo/src/routes/+page.svelte')).toBe(false)
})

it('keeps CLI, live servers and build translation layouts in separate directories', () => {
  const main = getParaglideOutput([], 'serve')
  const check = getParaglideOutput(['--port', '4173'], 'serve')
  const build = getParaglideOutput([], 'build')
  expect(main).toBe('.svelte-kit/generated/paraglide-dev')
  expect(check).toBe('.svelte-kit/dev-4173/generated/paraglide-dev')
  expect(build).toBe('.svelte-kit/generated/paraglide-build')
  expect(new Set(['src/lib/paraglide', main, check, build]).size).toBe(4)
})
