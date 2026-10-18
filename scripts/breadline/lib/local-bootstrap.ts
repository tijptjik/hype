// NODE
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
// BUN
import type { Database } from 'bun:sqlite'
// LOCAL AUTH
import { DEV_PERSONAS } from '../../../src/lib/auth/dev-personas'
// LOCAL MAP CATALOG
import { buildSyncSql } from '../../sync-map-styles'

// +++ Table Of Contents
// 1. SCHEMA AND MIGRATION REPLAY
// 2. LOCAL APPLICATION SETUP
// ---

/**
 * Create a clean source-derived local schema and replay every migration in order.
 * @param db Empty, disposable SQLite database; never a populated/live destination.
 * @param root Repository root containing the versioned baseline and migrations.
 * @returns Input hashes and applied migration names for the private rebuild receipt.
 * @remarks Historical seed migrations require two hub IDs and a temporary user ID.
 * This bootstrap supplies only those references, never old users, credentials or content.
 */
export function bootstrapLocalDatabase(
  db: Database,
  root: string,
): {
  migrations: Array<{ name: string; sha256: string }>
  baseline: Array<{ name: string; sha256: string }>
} {
  const tables = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
  if (tables.length)
    throw new Error('Local bootstrap requires an empty disposable database')
  const baseline = ['000_schema.sql', '0002_hub_i18n.sql'].map(name => {
    const sql = readFileSync(resolve(root, 'scripts/breadline/bootstrap', name), 'utf8')
    db.exec(sql)
    return { name, sha256: createHash('sha256').update(sql).digest('hex') }
  })
  db.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO hub(id,code,domain) VALUES
      ('4Jsk5LngvFZq','hkghostsigns','hkghostsigns.com'),
      ('Zmr0egfhmvs-','core','hype.hk'),
      ('breadlineHub','breadline','breadline.hk');
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES
      ('qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM','Local bootstrap',NULL,1,1);`)
  const migrations: Array<{ name: string; sha256: string }> = []
  // Honour SQLite's foreign-key pragma outside transactions during historical table rebuilds.
  for (const name of readdirSync(resolve(root, 'migrations'))
    .filter(name => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(resolve(root, 'migrations', name), 'utf8')
    const disablesForeignKeys = /PRAGMA\s+foreign_keys\s*=\s*(OFF|0|false)/i.test(sql)
    db.exec(disablesForeignKeys ? 'PRAGMA foreign_keys=OFF' : 'PRAGMA foreign_keys=ON')
    db.transaction(() => {
      // An intentional comment-only migration still needs a migration-ledger entry.
      if (
        sql
          .replace(/--[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim()
      )
        db.exec(sql)
      db.query('INSERT INTO d1_migrations(name) VALUES (?)').run(name)
    })()
    db.exec('PRAGMA foreign_keys=ON')
    migrations.push({ name, sha256: createHash('sha256').update(sql).digest('hex') })
  }
  if (db.query('PRAGMA foreign_key_check').all().length)
    throw new Error('Migration replay has foreign-key violations')
  return { migrations, baseline }
}

/**
 * Seed local hub labels, Breadline ownership scope and existing reserved dev personas.
 * @param db Fresh database after all migrations; no imported users yet.
 * @returns Nothing after the deterministic local application setup completes.
 * @remarks Test fixture email names never grant admin privileges. Only the existing
 * reserved local admin persona receives the migration bootstrap's admin assignments.
 */
export function seedLocalApplication(db: Database): void {
  db.transaction(() => {
    const now = Date.now()
    for (const persona of Object.values(DEV_PERSONAS))
      db.query(`INSERT INTO user
      (id,name,username,displayUsername,email,emailVerified,isAnonymous,isArchived,createdAt,updatedAt)
      VALUES (?,?,?,?,?,1,0,0,?,?)`).run(
        persona.id,
        persona.name,
        persona.username,
        persona.username,
        persona.email,
        now,
        now,
      )
    db.query('UPDATE hubRole SET userId=? WHERE userId=?').run(
      DEV_PERSONAS.admin.id,
      'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM',
    )
    db.query('DELETE FROM user WHERE id=?').run('qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM')
    db.exec(
      "INSERT INTO organisation(id,code,hubId,isPublished) VALUES ('hkfoodworks1','hkfoodworks','breadlineHub',1)",
    )
    db.exec(`INSERT INTO project(id,code,organisationId,isPublished,capabilities)
      VALUES ('breadlinePrj','breadline','hkfoodworks1',1,'{"manageBakeries":true,"manageVolunteers":true,"manageDropOffs":true}')`)
    const hubs = [
      { id: 'Zmr0egfhmvs-', name: 'HYPE' },
      { id: '4Jsk5LngvFZq', name: 'HK Ghost Signs' },
      { id: 'breadlineHub', name: 'Breadline' },
    ]
    for (const locale of ['en', 'zh-hant', 'zh-hans']) {
      for (const hub of hubs)
        db.query(`INSERT INTO hubI18n (hubId,locale,name,nameShort,nameGen,nameShortGen)
        VALUES (?,?,?,?,0,0) ON CONFLICT(hubId,locale) DO UPDATE SET name=excluded.name,nameShort=excluded.nameShort`).run(
          hub.id,
          locale,
          hub.name,
          hub.name,
        )
      db.query(
        'INSERT INTO organisationI18n(organisationId,locale,name,nameShort) VALUES (?,?,?,?)',
      ).run('hkfoodworks1', locale, 'HK FoodWorks', 'HK FoodWorks')
      db.query(
        'INSERT INTO projectI18n(projectId,locale,name,nameShort) VALUES (?,?,?,?)',
      ).run('breadlinePrj', locale, 'Breadline', 'Breadline')
    }
  })()
  // Reuse the same catalog sync as normal local preparation, including Day Runner/Night Runner.
  db.exec(buildSyncSql('local'))
  db.query(`INSERT INTO projectMapStyles(projectId,mapStyleId)
    SELECT 'breadlinePrj',id FROM mapStyles WHERE code='breadline-light'`).run()
}
