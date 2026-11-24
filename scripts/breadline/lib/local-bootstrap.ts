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

// These data scripts seed or amend specific production collections. A clean local
// database has no such collection or contributor IDs. Keep them out of its applied ledger.
const productionData = new Set([
  '0028_seed_breadline_layers.sql',
  '0034_seed_eln_project_properties.sql',
  '0035_seed_eln_book_features.sql',
  '0036_seed_eln_book_images.sql',
  '0037_seed_foodaccess_base_entities.sql',
  '0038_seed_foodaccess_project_properties.sql',
  '0039_seed_foodaccess_layers.sql',
  '0040_seed_foodaccess_features.sql',
  '0041_seed_foodaccess_feature_properties.sql',
  '0042_seed_eln_2025_features.sql',
  '0043_seed_eln_2024_spots.sql',
  '0046_set_ztoryhome_display_address.sql',
  '0099_offboard_farmthecity.sql',
  '0127_eln_sourced_backfill.sql',
  '0128_eln_edition_order.sql',
  '0131_default_map_descriptions.sql',
  '0152_historical_layer_descriptions.sql',
  '0201_neon_contributor_attribution.sql',
  '0204_independent_bookstores_contributor_attribution.sql',
  '0207_former_bookstore_occupancy.sql',
  '0223_breadline_mtr_paid_area.sql',
])

/**
 * Create a clean source-derived local schema and replay applicable migrations in order.
 * @param db Empty, disposable SQLite database; never a populated/live destination.
 * @param root Repository root containing the versioned baseline and migrations.
 * @returns Input hashes and applied migration names for the private rebuild receipt.
 * @remarks Historical schema and catalogue migrations require the local ownership scope and a temporary user ID.
 * This bootstrap supplies only those references, never old users, credentials or content.
 * Production collection data scripts are recorded separately from applied schema migrations.
 */
export function bootstrapLocalDatabase(
  db: Database,
  root: string,
): {
  migrations: Array<{ name: string; sha256: string }>
  baseline: Array<{ name: string; sha256: string }>
  deferred: Array<{ name: string; sha256: string }>
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
    INSERT INTO organisation(id,code,hubId,isPublished) VALUES ('hkfoodworks1','hkfoodworks','breadlineHub',1);
    INSERT INTO project(id,code,organisationId,isPublished) VALUES ('breadlinePrj','breadline','hkfoodworks1',1);
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES
      ('qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM','Local bootstrap',NULL,1,1);`)
  const migrations: Array<{ name: string; sha256: string }> = []
  const deferred: Array<{ name: string; sha256: string }> = []
  // Honour SQLite's foreign-key pragma outside transactions during historical table rebuilds.
  for (const name of readdirSync(resolve(root, 'migrations'))
    .filter(name => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(resolve(root, 'migrations', name), 'utf8')
    // Keep the original SQL hash in the receipt for each inapplicable collection update.
    if (productionData.has(name)) {
      deferred.push({ name, sha256: createHash('sha256').update(sql).digest('hex') })
      continue
    }
    const disablesForeignKeys = /PRAGMA\s+foreign_keys\s*=\s*(OFF|0|false)/i.test(sql)
    db.exec(disablesForeignKeys ? 'PRAGMA foreign_keys=OFF' : 'PRAGMA foreign_keys=ON')
    try {
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
    } catch (error) {
      throw new Error(`Local bootstrap migration failed: ${name}`, { cause: error })
    }
    db.exec('PRAGMA foreign_keys=ON')
    migrations.push({ name, sha256: createHash('sha256').update(sql).digest('hex') })
  }
  if (db.query('PRAGMA foreign_key_check').all().length)
    throw new Error('Migration replay has foreign-key violations')
  return { migrations, baseline, deferred }
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
