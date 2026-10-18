// NODE
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// TESTS
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
// PIPELINE
import { bootstrapLocalDatabase, seedLocalApplication } from './lib/local-bootstrap'

/**
 * Create real migrated app fixtures for preservation testing.
 * @param path Disposable SQLite database path.
 * @returns Open database with the current schema and historical application seeds.
 */
function application(path: string): Database {
  const db = new Database(path)
  bootstrapLocalDatabase(db, resolve('.'))
  seedLocalApplication(db)
  return db
}

describe('local application preservation', () => {
  it('restores resource state and authors without replacing current accounts, sessions or users', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-app-restore-'))
    const snapshotPath = join(directory, 'snapshot.sqlite')
    const targetPath = join(directory, 'prepared.sqlite')
    const receiptPath = join(directory, 'receipt.json')
    const source = application(snapshotPath)
    const target = application(targetPath)
    try {
      source.exec(`INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES ('old-author','Original author','old@example.invalid',1,1);
        INSERT INTO account(id,userId,providerId,accountId,accessToken,createdAt,updatedAt) VALUES ('old-account','old-author','google','old-subject','never-restore-this-token',1,1);
        UPDATE organisation SET isPublished=0,isArchived=1,publisherId='old-author' WHERE code='farmthecity';
        UPDATE project SET isPublished=0,isArchived=1 WHERE code='foodaccess';`)
      target.exec(`INSERT INTO user(id,name,email,telephone,createdAt,updatedAt) VALUES ('current','Current user','current@example.invalid','+85291234567',1,1);
        INSERT INTO account(id,userId,providerId,accountId,createdAt,updatedAt) VALUES ('current-account','current','google','current-subject',1,1);
        INSERT INTO session(id,userId,token,expiresAt,createdAt,updatedAt) VALUES ('current-session','current','current-token',9999999999999,1,1);`)
      const result = Bun.spawnSync([
        'python3',
        'scripts/breadline/restore-local-application.py',
        '--snapshot',
        snapshotPath,
        '--prepared-database',
        targetPath,
        '--receipt',
        receiptPath,
      ])
      expect(result.stderr.toString()).toBe('')
      expect(result.exitCode).toBe(0)
      const restored = new Database(targetPath)
      try {
        expect(
          restored
            .query(
              "SELECT isPublished,isArchived,publisherId FROM organisation WHERE code='farmthecity'",
            )
            .get(),
        ).toEqual({ isPublished: 0, isArchived: 1, publisherId: 'old-author' })
        expect(
          restored.query("SELECT email,telephone FROM user WHERE id='current'").get(),
        ).toEqual({ email: 'current@example.invalid', telephone: '+85291234567' })
        expect(
          restored
            .query("SELECT email,telephone,isArchived FROM user WHERE id='old-author'")
            .get(),
        ).toEqual({ email: null, telephone: null, isArchived: 1 })
        expect(restored.query('SELECT id FROM account').all()).toEqual([
          { id: 'current-account' },
        ])
        expect(restored.query('SELECT id FROM session').all()).toEqual([
          { id: 'current-session' },
        ])
        expect(restored.query('PRAGMA foreign_key_check').all()).toEqual([])
        const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
        expect(receipt.authenticationAndImportTablesUnchanged).toBe(true)
        expect(receipt.historicalAuthorsWithoutCredentials).toBe(1)
      } finally {
        restored.close()
      }
    } finally {
      source.close()
      target.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('refuses minimal local installation without an application snapshot', () => {
    const result = Bun.spawnSync([
      'bun',
      'scripts/breadline/prepare-local.ts',
      '--apply',
      '--database-file',
      '/tmp/not-a-local-database.sqlite',
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(
      'Local installation requires --application-snapshot',
    )
  })
})
