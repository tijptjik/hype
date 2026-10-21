import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})
/** Build private CLI inputs without Feature writes. @returns Paths and command invocation. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'split-executor-cli-'))
  directories.push(directory)
  const manifest = join(directory, 'split.json'),
    receipt = join(directory, 'receipt.json'),
    database = join(directory, 'db.sqlite')
  const bytes = JSON.stringify({
    version: 1,
    strategy: 'unresolved-with-preserved-values',
    plans: [],
  })
  writeFileSync(manifest, bytes)
  const sqlite = new Database(database)
  sqlite.exec('CREATE TABLE sentinel(id INTEGER)')
  sqlite.close()
  const args = [
    'scripts/locations/execute-feature-split.ts',
    '--manifest',
    manifest,
    '--sha256',
    createHash('sha256').update(bytes).digest('hex'),
    '--receipt',
    receipt,
  ]
  return {
    receipt,
    database,
    run: (target: string[]) =>
      spawnSync(process.execPath, [...args, ...target], {
        encoding: 'utf8',
        timeout: 10000,
      }),
  }
}

test('remote description is offline and creates neither receipt nor lock', () => {
  const f = fixture()
  const result = f.run([
    '--remote',
    'production',
    '--account-id',
    'a'.repeat(32),
    '--database-id',
    '7786af0e-3782-47f8-b70d-de645ba836ad',
  ])
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).mode).toBe('describe-only')
  expect(existsSync(f.receipt)).toBe(false)
  expect(existsSync(f.receipt + '.lock')).toBe(false)
})

test('explicit local application preserves prior runs and releases its receipt lock', () => {
  const f = fixture()
  for (let i = 0; i < 2; i++) {
    expect(f.run(['--sqlite', f.database, '--apply']).status).toBe(0)
    expect(existsSync(f.receipt + '.lock')).toBe(false)
  }
  const receipt = JSON.parse(readFileSync(f.receipt, 'utf8'))
  expect(receipt.runs.map((run: { status: string }) => run.status)).toEqual([
    'complete',
    'complete',
  ])
})

test('an occupied receipt lock prevents an overlapping execution', () => {
  const f = fixture()
  writeFileSync(f.receipt + '.lock', 'fixture owner')
  const result = f.run(['--sqlite', f.database, '--apply'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('SPLIT_RECEIPT_IN_USE_OR_UNWRITABLE')
  expect(existsSync(f.receipt)).toBe(false)
  expect(readFileSync(f.receipt + '.lock', 'utf8')).toBe('fixture owner')
})
