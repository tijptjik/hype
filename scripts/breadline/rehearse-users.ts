// NODE
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// BUN
import { Database } from 'bun:sqlite'
// DRIZZLE
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
// SCHEMA
import { user, account } from '../../src/lib/db/schema/user'
// TYPES
import type { TargetIdentitySnapshot, UserImportPlan } from './lib/users'

/**
 * Rehearse a private user plan against the real Drizzle schema in disposable memory.
 * @returns Nothing; writes only an offline verification receipt alongside the plan.
 * @remarks No source or Hype destination connection is opened.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--plan')
    throw new Error('Expected --plan directory')
  const directory = resolve(args[1])
  const plan = JSON.parse(
    readFileSync(resolve(directory, 'plan.json'), 'utf8'),
  ) as UserImportPlan
  const target = JSON.parse(
    readFileSync(resolve(directory, 'target-identities.json'), 'utf8'),
  ) as TargetIdentitySnapshot
  const schema = await generateSQLiteDrizzleJson({ user, account })
  const empty = structuredClone(schema)
  empty.tables = {}
  const statements = await generateSQLiteMigration(empty, schema)
  const db = new Database(':memory:')
  try {
    db.run('PRAGMA foreign_keys=ON')
    for (const statement of statements) db.run(statement)
    // Seed only identity fields from the read-only target snapshot, with fixture timestamps.
    const insert = (
      table: 'user' | 'account',
      row: Record<string, string | number | boolean | null>,
    ): void => {
      const entries = Object.entries(row)
      db.query(
        `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
      ).run(
        ...entries.map(([, value]) =>
          typeof value === 'boolean' ? Number(value) : value,
        ),
      )
    }
    db.transaction(() => {
      for (const row of target.users)
        insert('user', { ...row, createdAt: 0, updatedAt: 0 })
      for (const row of target.accounts)
        insert('account', { ...row, createdAt: 0, updatedAt: 0 })
      for (const row of plan.users) insert('user', { ...row })
      for (const row of plan.accounts) insert('account', { ...row })
    })()
    const foreignKeys = db.query('PRAGMA foreign_key_check').all()
    const integrity = db.query('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (foreignKeys.length || integrity.integrity_check !== 'ok')
      throw new Error('Rehearsal integrity failed')
    const users = (
      db.query('SELECT count(*) AS count FROM user').get() as { count: number }
    ).count
    const accounts = (
      db.query('SELECT count(*) AS count FROM account').get() as { count: number }
    ).count
    if (
      users !== target.users.length + plan.users.length ||
      accounts !== target.accounts.length + plan.accounts.length
    )
      throw new Error('Rehearsal counts failed')
    const receipt = {
      checkedAt: new Date().toISOString(),
      schema: 'current Drizzle user/account',
      importedUsers: plan.users.length,
      importedAccounts: plan.accounts.length,
      foreignKeyViolations: 0,
      integrity: 'ok',
      unresolvedSourceRows: plan.counts.exceptions,
    }
    writeFileSync(
      resolve(directory, 'rehearsal.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { mode: 0o600 },
    )
    console.log(JSON.stringify(receipt, null, 2))
  } finally {
    db.close()
  }
}
main().catch(() => {
  console.error(
    'Disposable user-import rehearsal failed; details suppressed to protect identity data.',
  )
  process.exitCode = 1
})
