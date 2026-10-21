// NODE
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { feature } from '../../src/lib/db/schema/feature'
import { featureLocation } from '../../src/lib/db/schema/location'
import { readFeatureLocationBaseline } from '../../src/lib/db/services/locationBaseline'
import { applyUnresolvedFeatureSplit } from '../../src/lib/db/services/locationSplit'
import { planUnresolvedFeatureSplit } from '../../src/lib/locations/migrationPlan'
import { planBreadlineFeatures } from '../breadline/features'
import { openSqliteDomain } from './lib/sqlite-domain'

/** Execute a local tool and propagate every failure. @param command Executable. @param args Literal arguments. @returns Captured stdout. */
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`)
  return result.stdout
}
/** Hash a retained input or generated plan. @param path Local file. @returns SHA-256. */
function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
/** Write private JSON evidence. @param path Receipt destination. @param value Serializable evidence. @returns Nothing. */
function receipt(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
}
/** Back up SQLite consistently without mutating the input. @param source Existing SQLite file. @param target New SQLite copy. @returns Nothing. */
function backup(source: string, target: string): void {
  if (existsSync(target)) throw new Error('Rehearsal refuses to overwrite a database')
  run('python3', [
    '-c',
    String.raw`import sqlite3,sys,pathlib
s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
t=sqlite3.connect(sys.argv[2]);s.backup(t);s.close();t.close()`,
    source,
    target,
  ])
}
/** Apply SQL with fail-fast transaction semantics. @param database Isolated database. @param path SQL file. @param migration Optional migration-ledger name. @returns Nothing. */
function applySql(database: string, path: string, migration = ''): void {
  run('python3', [
    '-c',
    String.raw`import sqlite3,sys,pathlib
c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA foreign_keys=ON')
try:
 c.executescript('BEGIN IMMEDIATE;\n'+pathlib.Path(sys.argv[2]).read_text())
 if sys.argv[3]: c.execute('INSERT INTO d1_migrations(name) VALUES(?)',(sys.argv[3],))
 if c.execute('PRAGMA foreign_key_check').fetchall(): raise ValueError('Foreign key violations')
 c.commit()
finally: c.close()`,
    database,
    path,
    migration,
  ])
}
/**
 * Rehearse schema expansion, preservation split and Breadline import from explicit exports.
 * @returns A private artifact directory and count-only completion evidence.
 * @remarks Never resets primary local state or accesses remote services. Existing output
 * directories are refused. Review exclusions block completion unless they are drafts,
 * intangible/non-point features or already-linked records. No identities are guessed.
 */
async function main(): Promise<void> {
  const [hypeInput, breadlineInput, directoryInput] = process.argv.slice(2)
  if (!hypeInput || !breadlineInput || !directoryInput)
    throw new Error(
      'Usage: rehearse-migration.ts HYPE_EXPORT.sqlite BREADLINE_MIRROR.sqlite NEW_OUTPUT_DIRECTORY',
    )
  const directory = resolve(directoryInput)
  if (!directory.startsWith(resolve('.local/locations') + '/') || existsSync(directory))
    throw new Error(
      'Choose a new .local/locations/ directory; existing artifacts are never replaced',
    )
  process.umask(0o077)
  mkdirSync(directory, { recursive: true })
  const source = resolve(hypeInput),
    breadline = resolve(breadlineInput)
  const hashes = { hype: digest(source), breadline: digest(breadline) }
  const resultPath = resolve(directory, 'result.sqlite')
  const sourcePath = resolve(directory, 'breadline.sqlite')
  backup(source, resultPath)
  backup(breadline, sourcePath)
  receipt(resolve(directory, 'inputs.json'), {
    version: 1,
    hashes,
    sourceRevision: run('git', ['rev-parse', 'HEAD']).trim(),
    sourceSnapshotHash: digest(sourcePath),
  })
  const migrationFiles = readdirSync('migrations')
    .filter(name => /^\d+.*\.sql$/.test(name))
    .sort()
  let connection = openSqliteDomain(resultPath)
  const applied = new Set(
    (
      connection.sqlite.query('SELECT name FROM d1_migrations').all() as {
        name: string
      }[]
    ).map(row => row.name),
  )
  connection.close()
  const migrations = []
  for (const name of migrationFiles) {
    if (applied.has(name)) continue
    const path = resolve('migrations', name)
    applySql(resultPath, path, name)
    migrations.push({ name, sha256: digest(path) })
  }
  receipt(resolve(directory, 'schema.json'), { migrations })
  const baselinePath = resolve(directory, 'schema-baseline.sqlite')
  backup(resultPath, baselinePath)
  connection = openSqliteDomain(resultPath)
  let planned = 0
  const counts: Record<string, number> = {}
  try {
    const rows = await connection.db
      .select({ id: feature.id, projectId: feature.projectId })
      .from(feature)
      .orderBy(feature.id)
    const linked = new Set(
      (
        await connection.db.select({ id: featureLocation.featureId }).from(featureLocation)
      ).map(row => row.id),
    )
    const plans = []
    const exclusions = []
    // Preserve every existing effective Feature value through the same domain planner used by the app.
    for (const row of rows) {
      if (linked.has(row.id)) {
        exclusions.push({ featureId: row.id, reason: 'already-linked' })
        continue
      }
      const baseline = await readFeatureLocationBaseline(
        connection.db,
        row.id,
        row.projectId,
      )
      const proposal =
        baseline.status === 'ready'
          ? planUnresolvedFeatureSplit(baseline.baseline)
          : baseline
      if (proposal.status === 'planned') plans.push(proposal.plan)
      else exclusions.push({ featureId: row.id, reason: proposal.reason })
    }
    for (const exclusion of exclusions)
      counts[exclusion.reason] = (counts[exclusion.reason] ?? 0) + 1
    planned = plans.length
    const manifestPath = resolve(directory, 'split.json')
    receipt(manifestPath, {
      version: 1,
      strategy: 'unresolved-with-preserved-values',
      total: rows.length,
      counts: { planned, ...counts },
      plans,
      exclusions,
    })
    const reviews = exclusions.filter(
      row =>
        !['already-linked', 'draft', 'intangible', 'non-point'].includes(row.reason),
    )
    if (reviews.length)
      throw new Error(
        'Feature baselines require review; inspect split.json before applying',
      )
    // First application and replay are both checked, including each association history fence.
    for (const replay of [false, true]) {
      const outcomes = []
      for (const plan of plans) {
        const outcome = await applyUnresolvedFeatureSplit(
          connection.db,
          plan,
          'migration:existing-feature-split',
        )
        outcomes.push({ featureId: plan.featureId, status: outcome.status })
        assert.equal(outcome.status, replay ? 'already-applied' : 'applied')
      }
      receipt(resolve(directory, replay ? 'split-replay.json' : 'split-apply.json'), {
        outcomes,
      })
    }
  } finally {
    connection.close()
  }
  const splitVerification = JSON.parse(
    run('bun', [
      'scripts/locations/verify-feature-split.ts',
      resolve(directory, 'split.json'),
      baselinePath,
      resultPath,
    ]),
  )
  receipt(resolve(directory, 'split-verification.json'), splitVerification)
  const splitPath = resolve(directory, 'before-import.sqlite')
  backup(resultPath, splitPath)
  const importPath = resolve(directory, 'breadline.sql')
  planBreadlineFeatures([
    '--source',
    sourcePath,
    '--target',
    resultPath,
    '--output',
    importPath,
  ])
  applySql(resultPath, importPath)
  const replayBaseline = resolve(directory, 'before-replay.sqlite')
  backup(resultPath, replayBaseline)
  const replayPath = resolve(directory, 'breadline-replay.sql')
  planBreadlineFeatures([
    '--source',
    sourcePath,
    '--target',
    resultPath,
    '--output',
    replayPath,
  ])
  applySql(resultPath, replayPath)
  // Verify all original Feature rows survive and replay leaves domain/history data byte-for-byte equivalent.
  const verification = JSON.parse(
    run('python3', [
      '-c',
      String.raw`import sqlite3,json,sys
from collections import Counter
c=sqlite3.connect(sys.argv[1]);c.execute('ATTACH DATABASE ? AS baseline',(sys.argv[2],));c.execute('ATTACH DATABASE ? AS replay',(sys.argv[3],))
tables=['feature','featureI18n','featureProperty','featurePropertyI18n','location','locationRevision','featureLocation','featureLocationHistory','breadlineImportFeature','property','propertyValueI18n']
for table in tables:
 actual=Counter(c.execute('SELECT * FROM main.'+table).fetchall())
 original=Counter(c.execute('SELECT * FROM baseline.'+table).fetchall())
 replay=Counter(c.execute('SELECT * FROM replay.'+table).fetchall())
 if original-actual: raise ValueError('Original rows changed: '+table)
 if replay!=actual: raise ValueError('Replay changed rows or multiplicities: '+table)
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not c.execute('PRAGMA foreign_key_check').fetchall()
print(json.dumps({'integrity':'ok','replayUnchanged':True,'tables':tables,'counts':{t:c.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['feature','location','featureLocation']}}))`,
      resultPath,
      splitPath,
      replayBaseline,
    ]),
  )
  assert.equal(digest(source), hashes.hype, 'HYPE input changed during rehearsal')
  assert.equal(
    digest(breadline),
    hashes.breadline,
    'Breadline input changed during rehearsal',
  )
  const summary = {
    version: 1,
    status: 'verified-local-rehearsal',
    schemaMigrations: migrations.length,
    split: { planned, exclusions: counts },
    import: JSON.parse(readFileSync(importPath + '.receipt.json', 'utf8')),
    replay: JSON.parse(readFileSync(replayPath + '.receipt.json', 'utf8')),
    verification,
    hashes: {
      importSql: digest(importPath),
      replaySql: digest(replayPath),
      splitManifest: digest(resolve(directory, 'split.json')),
    },
  }
  receipt(resolve(directory, 'receipt.json'), summary)
  console.log(
    JSON.stringify({
      status: summary.status,
      schemaMigrations: migrations.length,
      split: summary.split,
      created: summary.import.created,
      matchedOnReplay: summary.replay.matched,
      ...verification,
    }),
  )
}
await main()
