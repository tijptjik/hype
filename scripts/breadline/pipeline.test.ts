// BUN
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
// NODE
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// PIPELINE
import { backupMirror } from './lib/backup'
import { convertSnapshot, targetArguments, writeImportPlan } from './lib/pipeline'
import { formatBreadlineError } from './lib/config'

// Check the dangerous boundaries with synthetic data; never load production credentials.
describe('Breadline import boundaries', () => {
  it('backs up committed WAL rows and never overwrites earlier backups', () => {
    const dir = mkdtempSync(join(tmpdir(), 'breadline-backup-'))
    const path = join(dir, 'mirror.sqlite')
    const db = new Database(path)
    try {
      db.run(
        'PRAGMA journal_mode=WAL; CREATE TABLE fixture(id INTEGER PRIMARY KEY); INSERT INTO fixture VALUES (1)',
      )
      const first = backupMirror(path)
      db.run('INSERT INTO fixture VALUES (2)')
      const second = backupMirror(path)
      expect(first).not.toBe(second)
      const copy = new Database(first, { readonly: true })
      expect(copy.query('SELECT COUNT(*) AS n FROM fixture').get()).toEqual({ n: 1 })
      copy.close()
      expect(statSync(first).mode & 0o777).toBe(0o600)
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('requires a reviewed converter and routes targets explicitly', async () => {
    await expect(convertSnapshot('/nonexistent', [])).rejects.toThrow(
      'No reviewed conversion stages',
    )
    expect(targetArguments('local')).toContain('--local')
    expect(targetArguments('local')).not.toContain('--remote')
    expect(targetArguments('production')).toEqual([
      'hype-db-prod',
      '--remote',
      '--env',
      'production',
      '--config',
      'wrangler.toml',
    ])
  })

  it('makes plans private and refuses to replace a reviewed plan', () => {
    const dir = mkdtempSync(join(tmpdir(), 'breadline-plan-'))
    try {
      const path = writeImportPlan(join(dir, 'plan.sql'), ['SELECT 1;'])
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(() => writeImportPlan(path, ['SELECT 2;'])).toThrow()
      expect(readFileSync(path, 'utf8')).toBe('SELECT 1;')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('redacts all Breadline connection values', () => {
    expect(
      formatBreadlineError(new Error('secret-host secret-password'), {
        BREADLINE_HOST: 'secret-host',
        BREADLINE_PASSWORD: 'secret-password',
      }),
    ).toBe('<redacted> <redacted>')
  })
})

describe('Breadline user migration', () => {
  it('only adds nullable telephone and preserves existing users', () => {
    const db = new Database(':memory:')
    try {
      db.run(
        "CREATE TABLE user(id TEXT PRIMARY KEY, email TEXT); INSERT INTO user VALUES ('existing','example@example.com')",
      )
      db.exec(readFileSync('migrations/0085_breadline_users.sql', 'utf8'))
      expect(db.query('SELECT * FROM user').get()).toEqual({
        id: 'existing',
        email: 'example@example.com',
        telephone: null,
      })
      expect(
        db.query("SELECT name FROM sqlite_master WHERE type='table'").all(),
      ).toEqual([{ name: 'user' }])
    } finally {
      db.close()
    }
  })
})

describe('Username casing migration', () => {
  it('preserves spelling, normalizes lookup, and prevents case-insensitive duplicates', () => {
    const db = new Database(':memory:')
    try {
      db.exec(
        "CREATE TABLE user(id TEXT PRIMARY KEY, username TEXT UNIQUE); INSERT INTO user VALUES ('one', 'MixedCase')",
      )
      readFileSync('migrations/0086_username_display_case.sql', 'utf8')
        .split('--> statement-breakpoint')
        .forEach(statement => {
          db.exec(statement.replace(/^--.*$/gm, '').trim())
        })
      expect(db.query('SELECT username, displayUsername FROM user').get()).toEqual({
        username: 'mixedcase',
        displayUsername: 'MixedCase',
      })
      expect(() =>
        db.exec("INSERT INTO user(id, username) VALUES ('two', 'MIXEDCASE')"),
      ).toThrow()
    } finally {
      db.close()
    }
  })

  it('blocks existing casing collisions instead of merging users', () => {
    const db = new Database(':memory:')
    try {
      db.exec(
        "CREATE TABLE user(id TEXT PRIMARY KEY, username TEXT UNIQUE); INSERT INTO user VALUES ('one', 'Name'), ('two', 'name')",
      )
      expect(() =>
        readFileSync('migrations/0086_username_display_case.sql', 'utf8')
          .split('--> statement-breakpoint')
          .forEach(statement => {
            db.exec(statement.replace(/^--.*$/gm, '').trim())
          }),
      ).toThrow()
      expect(db.query('SELECT count(*) AS count FROM user').get()).toEqual({ count: 2 })
    } finally {
      db.close()
    }
  })
})
