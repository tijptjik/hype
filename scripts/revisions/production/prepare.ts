// NODE
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
// CURATION
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import { matchingBrandingHash, prepareMatchingBranding } from './matching-branding'
import {
  completeness,
  digest,
  fences,
  fingerprint,
  identifier,
  schemaFingerprint,
} from './contract'
import type { Plan } from './contract'

type Domain = ReturnType<typeof openSqliteDomain>

/**
 * Write and hash the existing compact plan format in one pass, retaining at most one serialized group.
 * @param directory Private preparation directory. @param plan Complete verified plan.
 * @returns Release digest, excluding the trailing newline as in the remote contract.
 */
function persistPlan(directory: string, plan: Plan): string {
  const pending = join(directory, '.plan-' + randomUUID())
  const fd = openSync(pending, 'wx', 0o600)
  const hash = createHash('sha256')
  const append = (chunk: string) => {
    writeFileSync(fd, chunk)
    hash.update(chunk)
  }
  try {
    try {
      append('{')
      let separator = ''
      for (const [key, value] of Object.entries(plan)) {
        if (value === undefined) continue
        append(separator + JSON.stringify(key) + ':')
        if (key === 'groups') {
          append('[')
          for (const [index, group] of plan.groups.entries()) {
            if (index) append(',')
            append(JSON.stringify(group))
          }
          append(']')
        } else append(JSON.stringify(value))
        separator = ','
      }
      append('}')
      writeFileSync(fd, '\n')
    } finally {
      closeSync(fd)
    }
    // An interrupted write cannot expose a partial plan or replace an existing plan.
    linkSync(pending, join(directory, 'plan.json'))
    return hash.digest('hex')
  } finally {
    unlinkSync(pending)
  }
}

/** Inventory executable source, migrations and lockfiles, including uncommitted release work. @returns Sorted repository-relative paths. */
export function releaseSourceFiles(): string[] {
  const inventory = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
  if (inventory.status !== 0) throw new Error('Cannot inventory release source')
  const files = [...new Set(inventory.stdout.split('\0').filter(Boolean))].filter(
    file =>
      (/^(src|scripts|workers|migrations|messages|patches|project\.inlang)\//.test(
        file,
      ) ||
        [
          'package.json',
          'bun.lock',
          'wrangler.toml',
          'vite.config.ts',
          'svelte.config.js',
          'tsconfig.json',
          '.github/workflows/deploy.yml',
        ].includes(file)) &&
      !file.startsWith('src/lib/paraglide/') &&
      existsSync(file),
  )
  return files.sort()
}
/** Hash the exact release source inventory. @returns Content fingerprint. */
export function releaseSourceHash(): string {
  return digest(
    releaseSourceFiles().map(file => [
      file,
      digest(readFileSync(file).toString('base64')),
    ]),
  )
}
/** Canonical tables for enrollment checks; derived search is rebuilt by the existing exporter. @param d Offline domain. @returns Table names. */
export function tables(d: Domain): string[] {
  return (
    d.sqlite
      .query("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
  )
    .map(r => r.name)
    .filter(n => !/^(sqlite_|_cf_|featureSearchFts|_revisionDeployment)/.test(n))
}
/** Rehearse the standalone matching and branding data package on a private database copy.
 * @param source Restored production snapshot. @param directory New private artifact directory.
 * @param target Explicit production database identity. @param _cacheMedia Reserved for existing package callers.
 * @param options Reviewed package and required current Feature lifecycle.
 * @returns The immutable data-only plan.
 */
export async function prepareRelease(
  source: string,
  directory: string,
  target: string,
  _cacheMedia: unknown = undefined,
  options: { featureLifecycle?: 'current'; matchingBranding?: string } = {},
): Promise<Plan> {
  if (
    !options.matchingBranding ||
    !target.startsWith('production:') ||
    options.featureLifecycle !== 'current'
  )
    throw new Error(
      'A reviewed matching and branding package and current production lifecycle are required',
    )
  mkdirSync(directory, { mode: 0o700 })
  const database = join(directory, 'prepared.sqlite')
  const backup = spawnSync(
    'python3',
    [
      '-c',
      'import sqlite3,sys; s=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
      source,
      database,
    ],
    { encoding: 'utf8' },
  )
  if (backup.status !== 0) throw new Error('Snapshot backup failed')
  const d = openSqliteDomain(database)
  try {
    const currentLifecycle = (
      d.sqlite.query("PRAGMA table_info('feature')").all() as { name: string }[]
    ).some(column => column.name === 'currentRevisionId')
    if (!currentLifecycle) throw new Error('Curation requires current Feature storage')
    const initialSchema = schemaFingerprint(
      d.sqlite
        .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
        .all() as Record<string, unknown>[],
    )
    const initial = Object.fromEntries(
      tables(d).map(t => [
        t,
        fingerprint(
          d.sqlite.query(`SELECT * FROM ${identifier(t)}`).all() as Record<
            string,
            unknown
          >[],
        ),
      ]),
    )
    return prepareCuration(
      d,
      database,
      directory,
      target,
      initial,
      initialSchema,
      options.matchingBranding,
    )
  } finally {
    d.close()
  }
}

/** Apply the reviewed groups on the copy and fingerprint the resulting data.
 * @param d Connection to the private copy. @param database Private copy. @param directory Artifact directory. @param target Production identity.
 * @param initial Exact source rows. @param initialSchema Source schema. @param matchingBranding Reviewed package.
 * @returns Verified data plan and receipts.
 */
function prepareCuration(
  d: Domain,
  database: string,
  directory: string,
  target: string,
  initial: Plan['initial'],
  initialSchema: Plan['initialSchema'],
  matchingBranding: string,
): Plan {
  if (
    d.sqlite.query("SELECT 1 FROM sqlite_master WHERE name='_revisionDeployment'").get()
  )
    d.sqlite.exec('UPDATE _revisionDeployment SET writable=1')
  const groups = prepareMatchingBranding(
    d.sqlite,
    database,
    directory,
    matchingBranding,
  )
  for (const group of groups) {
    const statements = [
      ...group.statements,
      ...(group.tables ? fences(group.fenceTables ?? group.tables) : []),
    ]
    if (
      statements.length + 4 > 950 ||
      statements.some(
        statement =>
          Buffer.byteLength(statement.sql) > 95_000 || statement.params.length > 100,
      )
    )
      throw new Error(`Oversized atomic unit: ${group.label}`)
  }
  for (const check of completeness(true)) {
    try {
      d.sqlite.query(check.sql).all(...check.params)
    } catch {
      throw new Error('Curation requires complete revision baselines: ' + check.sql)
    }
  }
  const expected = Object.fromEntries(
    tables(d).map(table => [
      table,
      fingerprint(
        d.sqlite.query(`SELECT * FROM ${identifier(table)}`).all() as Record<
          string,
          unknown
        >[],
        true,
      ),
    ]),
  )
  const plan: Plan = {
    version: 1,
    matchingBrandingHash: matchingBrandingHash(matchingBranding),
    featureLifecycle: 'current',
    target,
    sourceHash: releaseSourceHash(),
    initial,
    initialSchema,
    expected,
    expectedSchema: schemaFingerprint(
      d.sqlite
        .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
        .all() as Record<string, unknown>[],
    ),
    groups,
    tables: tables(d),
    migrations: [],
  }
  if (digest(plan.initialSchema) !== digest(plan.expectedSchema))
    throw new Error('Curation changed the database schema')
  const planHash = persistPlan(directory, plan)
  writeFileSync(
    join(directory, 'receipt.json'),
    JSON.stringify(
      {
        planHash,
        target,
        curationGroups: groups.filter(group => group.label.startsWith('curation/'))
          .length,
        remoteWrites: false,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600, flag: 'wx' },
  )
  return plan
}
