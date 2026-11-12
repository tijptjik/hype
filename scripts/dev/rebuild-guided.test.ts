// NODE
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// TESTS
import { afterEach, expect, test } from 'bun:test'
// REBUILD
import { rebuildRetryArguments } from './rebuild-guided'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})
/** Write a temporary private checkpoint for retry-policy tests.
 * @param receipt Saved stage state. @returns Receipt path.
 */
function checkpoint(receipt: object): string {
  const directory = mkdtempSync(join(tmpdir(), 'rebuild-checkpoint-'))
  directories.push(directory)
  const path = join(directory, 'receipt.json')
  writeFileSync(path, JSON.stringify(receipt))
  return path
}
test('resumes only after successful reconciliation', () => {
  const path = checkpoint({ userReconciliation: { status: 'passed' } })
  expect(rebuildRetryArguments(path)).toEqual(['--resume', join(path, '..')])
})
test('reuses exports without pretending an earlier failed stage completed', () => {
  const path = checkpoint({
    inputs: '/private/exports',
    inputHashes: { source: 'verified' },
    mocks: false,
    userReconciliation: { status: 'failed' },
  })
  expect(rebuildRetryArguments(path)).toEqual([
    '--inputs',
    '/private/exports',
    '--no-mocks',
  ])
})
test('does not reinstall an applied checkpoint', () => {
  expect(() => rebuildRetryArguments(checkpoint({ applied: true }))).toThrow(
    'already installed',
  )
})
test('does not invent an export checkpoint', () => {
  expect(() => rebuildRetryArguments(checkpoint({}))).toThrow(
    'No complete export checkpoint',
  )
})
