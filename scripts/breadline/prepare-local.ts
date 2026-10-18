// NODE
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
// BUN
import { Database } from 'bun:sqlite'
// PIPELINE
import { backupMirror } from './lib/backup'
import { bootstrapLocalDatabase, seedLocalApplication } from './lib/local-bootstrap'
import { planLocalLatentUsers } from './lib/local-users'
import { parseUserDecisions } from './lib/user-decisions'
import { planUsers, userPlanSql } from './lib/users'
// TYPES
import type { LegacyUser, TargetIdentitySnapshot } from './lib/users'

// +++ Table Of Contents
// 1. PRIVATE SNAPSHOTS AND VALIDATION
// 2. REBUILD AND LOCAL INSTALL
// ---

/**
 * Read only the destination evidence needed to prove import repeatability.
 * @param db Prepared local database.
 * @returns Identity, ownership and private source crosswalks without credentials or tokens.
 */
function identities(db: Database): TargetIdentitySnapshot {
  return {
    users: db
      .query(
        'SELECT id,email,username,emailVerified,isArchived,isAnonymous,telephone FROM user',
      )
      .all(),
    accounts: db.query('SELECT id,userId,providerId,accountId FROM account').all(),
    importUsers: db
      .query('SELECT userId,telephone,state,claimedEmail FROM breadlineImportUser')
      .all(),
    identities: db
      .query(
        'SELECT sourceUserId,sourceVolunteerId,userId,email,name,sourceUid FROM breadlineImportIdentity',
      )
      .all(),
  } as TargetIdentitySnapshot
}

/**
 * Prepare an independently verified local database, then optionally install it with a backup.
 * @returns Nothing after private evidence and aggregate counts have been written.
 * @remarks This command has no remote target. Applying requires an explicit local database
 * file under the default Miniflare D1 namespace and the validated hype-db-local binding.
 * SQLite's online-backup API installs atomically without deleting live WAL/SHM files.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const root = resolve('.')
  let apply = false
  let destination: string | undefined
  let applicationSnapshot: string | undefined
  let fixturesPath = '.local/breadline/local-users.json'
  for (let i = 2; i < process.argv.length; i++) {
    const option = process.argv[i]
    if (option === '--apply') apply = true
    else if (option === '--database-file') destination = process.argv[++i]
    else if (option === '--application-snapshot')
      applicationSnapshot = process.argv[++i]
    else if (option === '--fixtures') fixturesPath = process.argv[++i]
    else
      throw new Error(
        'Usage: prepare-local.ts [--fixtures path] [--application-snapshot existing.sqlite] [--apply --database-file local.sqlite]',
      )
  }
  const config = Bun.TOML.parse(readFileSync('wrangler.local.toml', 'utf8')) as {
    vars?: { ENVIRONMENT?: string }
    d1_databases?: Array<{
      binding: string
      database_name: string
      database_id: string
      remote?: boolean
    }>
  }
  const local = config.d1_databases?.filter(binding => binding.binding === 'DB')
  if (
    local?.length !== 1 ||
    local[0].database_name !== 'hype-db-local' ||
    local[0].remote ||
    config.vars?.ENVIRONMENT !== 'local'
  )
    throw new Error('Expected the explicit local D1 binding')
  if (apply) {
    // A user import must never replace a populated application's content with historical seed rows.
    if (!applicationSnapshot)
      throw new Error(
        'Local installation requires --application-snapshot to preserve projects, layers and content; minimal seeds are rehearsal-only',
      )
    if (!destination)
      throw new Error('Applying requires an explicit local database file')
    destination = realpathSync(resolve(destination))
    if (
      dirname(destination) !==
        realpathSync(resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')) ||
      !/^[a-f0-9]{64}\.sqlite$/.test(basename(destination))
    )
      throw new Error('Refusing a file outside the local Miniflare D1 namespace')
  }
  const directory = resolve(
    '.local/breadline/local-rebuilds',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`,
  )
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = resolve(directory, 'prepared.sqlite')
  const db = new Database(path, { create: true })
  try {
    const schema = bootstrapLocalDatabase(db, root)
    seedLocalApplication(db)
    const sourcePath = backupMirror(resolve('.local/breadline/mirror.sqlite'))
    const source = new Database(sourcePath, { readonly: true })
    let rows: LegacyUser[]
    let checkpoints: unknown[]
    try {
      rows = source
        .query(
          'SELECT id,volunteer_id,uid,email,name,telephone,locale,picture,created_at,last_updated_at FROM breadline__public__users ORDER BY id',
        )
        .all() as LegacyUser[]
      checkpoints = source
        .query(
          "SELECT sourceTable,checkpoint FROM _breadline_sync_state WHERE sourceTable IN ('users','volunteers')",
        )
        .all()
    } finally {
      source.close()
    }
    const state = JSON.parse(
      readFileSync('.local/breadline/users/local/identity-seed.json', 'utf8'),
    )
    if (
      state.targetIdentity !== `local:${local[0].database_id}` ||
      !/^[a-f0-9]{64}$/.test(state.seed)
    )
      throw new Error('Local import seed belongs to a different target')
    const decisions = parseUserDecisions(
      JSON.parse(readFileSync('.local/breadline/user-decisions.json', 'utf8')),
    )
    const sourcePlan = planUsers(rows, identities(db), state.seed, decisions)
    const sourceSql = userPlanSql(sourcePlan)
    db.transaction(() => db.exec(sourceSql))()
    const fixtureInput = JSON.parse(readFileSync(resolve(fixturesPath), 'utf8'))
    const fixturePlan = planLocalLatentUsers(fixtureInput, identities(db), state.seed)
    if (fixturePlan.exceptions.length)
      throw new Error('Local fixtures conflict with the source import')
    db.transaction(() => db.exec(userPlanSql(fixturePlan)))()
    let applicationReceipt: unknown = null
    if (applicationSnapshot) {
      // Restore reviewed application content without replacing imported users, credentials or sessions.
      const receiptPath = resolve(directory, 'application-restore.json')
      const restore = Bun.spawnSync(
        [
          'python3',
          resolve(root, 'scripts/breadline/restore-local-application.py'),
          '--snapshot',
          backupMirror(realpathSync(resolve(applicationSnapshot))),
          '--prepared-database',
          path,
          '--receipt',
          receiptPath,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      if (restore.exitCode !== 0)
        throw new Error(`Application preservation failed: ${restore.stderr.toString()}`)
      applicationReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    }
    const final = identities(db)
    const repeat = planUsers(rows, final, state.seed, decisions)
    const fixtureRepeat = planLocalLatentUsers(fixtureInput, final, state.seed)
    if (
      repeat.users.length ||
      repeat.accounts.length ||
      repeat.importUsers.length ||
      repeat.identities.length ||
      fixtureRepeat.users.length ||
      fixtureRepeat.identities.length ||
      fixtureRepeat.exceptions.length ||
      JSON.stringify(repeat.exceptions) !== JSON.stringify(sourcePlan.exceptions)
    )
      throw new Error('Import is not repeatable')
    if (
      sourcePlan.mapping.length +
        sourcePlan.excluded.length +
        sourcePlan.counts.exceptions !==
      rows.length
    )
      throw new Error('Incomplete source coverage')
    const integrity = db.query('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (
      integrity.integrity_check !== 'ok' ||
      db.query('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Prepared database failed integrity checks')
    for (const [file, value] of Object.entries({
      'source-plan.json': sourcePlan,
      'local-fixture-plan.json': fixturePlan,
      'private-decisions.json': decisions,
      'local-fixtures.json': fixtureInput,
    }))
      writeFileSync(resolve(directory, file), `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
      })
    writeFileSync(
      resolve(directory, 'import.sql'),
      sourceSql + userPlanSql(fixturePlan),
      { mode: 0o600 },
    )
    const receipt = {
      application: applicationReceipt,
      createdAt: new Date().toISOString(),
      target: `local:${local[0].database_id}`,
      sourcePath,
      checkpoints,
      ...schema,
      decisionsSha256: createHash('sha256')
        .update(JSON.stringify(decisions))
        .digest('hex'),
      sourceCounts: sourcePlan.counts,
      autoClaimed: sourcePlan.importUsers.filter(row => row.state === 'claimed').length,
      latent: sourcePlan.importUsers.filter(row => row.state === 'unclaimed').length,
      recoveredMissingPhones: sourcePlan.warnings.filter(
        row => row.reason === 'missing_phone_from_unambiguous_identity',
      ).length,
      localFixtures: {
        users: fixturePlan.users.length,
        claimCandidates: fixturePlan.identities.length,
      },
      databaseUsers: final.users.length,
      foreignKeyViolations: 0,
      integrity: 'ok',
      repeatInserts: 0,
      applied: false,
      destination: destination ?? null,
      backup: null as string | null,
    }
    if (apply && destination) {
      const backup = resolve(directory, 'before-local.sqlite')
      // Python's SQLite backup API holds the destination write lock for the complete copy.
      const child = Bun.spawn(
        [
          'python3',
          '-c',
          `
import sqlite3,sys,os
os.umask(0o077)
destination,prepared,backup=sys.argv[1:]
target=sqlite3.connect(destination,timeout=60)
old=sqlite3.connect(backup)
target.backup(old)
assert old.execute('pragma integrity_check').fetchone()[0]=='ok'
old.close()
fresh=sqlite3.connect(prepared)
# Preserve only Miniflare's private engine metadata, not application data.
metadata=target.execute("select sql from sqlite_master where type='table' and name='_cf_METADATA'").fetchone()
if metadata:
    fresh.execute(metadata[0])
    records=target.execute('select * from _cf_METADATA').fetchall()
    for record in records:
        fresh.execute('insert into _cf_METADATA values ('+','.join('?' for _ in record)+')',record)
    fresh.commit()
fresh.backup(target)
assert target.execute('pragma integrity_check').fetchone()[0]=='ok'
assert not target.execute('pragma foreign_key_check').fetchall()
target.close()
fresh.close()
`,
          destination,
          path,
          backup,
        ],
        { stdout: 'ignore', stderr: 'pipe' },
      )
      if ((await child.exited) !== 0)
        throw new Error(
          'Local install failed; inspect the private rebuild directory and backup',
        )
      receipt.applied = true
      receipt.backup = backup
    }
    writeFileSync(
      resolve(directory, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600 },
    )
    console.log(
      JSON.stringify(
        {
          directory,
          applied: receipt.applied,
          sourceCounts: receipt.sourceCounts,
          recoveredMissingPhones: receipt.recoveredMissingPhones,
          autoClaimed: receipt.autoClaimed,
          latent: receipt.latent,
          localFixtures: receipt.localFixtures,
          integrity: receipt.integrity,
          repeatInserts: receipt.repeatInserts,
        },
        null,
        2,
      ),
    )
  } finally {
    db.close()
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Local preparation failed')
  process.exitCode = 1
})
