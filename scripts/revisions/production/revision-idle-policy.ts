// NODE
import { readFileSync } from 'node:fs'
// TYPES
import type { Database } from 'bun:sqlite'
import type { Group } from './contract'

/** Prepares the same idle policy for an already-converted Feature lifecycle database.
 * @param db Isolated release snapshot, never a live database.
 * @returns One atomic schema group, or no group when the policy is already installed.
 * @remarks The numbered migration targets compatibility storage. Converted databases install
 * its shared resource guards plus the lifecycle-specific extension, and record that migration
 * as applied so a later generic migration pass cannot install obsolete Feature guards.
 */
export function prepareRevisionIdlePolicy(db: Database): Group[] {
  const installed = db
    .query(
      "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='feature_draft_idle_upload_boundary'",
    )
    .get()
  const shared = db
    .query(
      "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='organisation_revision_immutable_update' AND instr(sql,'revisionEditWindow')>0",
    )
    .get()
  const receipt = {
    sql: "INSERT INTO d1_migrations(name) SELECT '0203_revision_edit_windows.sql' WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name='0203_revision_edit_windows.sql')",
    params: [] as (string | number | null)[],
  }
  if (installed && shared)
    return db
      .query("SELECT 1 FROM d1_migrations WHERE name='0203_revision_edit_windows.sql'")
      .get()
      ? []
      : [
          {
            label: 'revision-idle-policy-receipt',
            statements: [receipt],
            tables: ['d1_migrations'],
          },
        ]
  const migration = readFileSync('migrations/0203_revision_edit_windows.sql', 'utf8')
  const resourcePolicy = migration
    .slice(0, migration.indexOf('-- Feature snapshots remain mutable'))
    .replace(
      'CREATE TABLE revisionEditWindow',
      'CREATE TABLE IF NOT EXISTS revisionEditWindow',
    )
    .replace(
      'CREATE TABLE revisionEditSelection',
      'CREATE TABLE IF NOT EXISTS revisionEditSelection',
    )
  const intentPolicy = migration.slice(
    migration.indexOf('DROP TRIGGER image_intent_history_no_update;'),
    migration.indexOf('CREATE TRIGGER feature_idle_upload_boundary'),
  )
  let featurePolicy = readFileSync(
    'migrations/pending/feature-lifecycle/idle-windows.sql',
    'utf8',
  )
  // A reviewed plan must seal at one deterministic time on rehearsal and application.
  featurePolicy = featurePolicy.replace(
    /^UPDATE revisionEditWindow SET closedAt=.* WHERE resource IN \('feature','featureDraft'\);$/m,
    `UPDATE revisionEditWindow SET closedAt=${Date.now()} WHERE resource IN ('feature','featureDraft');`,
  )
  // Each trusted policy statement begins at column zero; trigger-body statements are indented or follow BEGIN.
  const statements = `${resourcePolicy}\n${intentPolicy}\n${featurePolicy}`
    .split(/(?=^(?:CREATE|DROP|UPDATE) )/m)
    .map(statement => statement.trim())
    .filter(statement => /^(?:CREATE|DROP|UPDATE) /.test(statement))
    .flatMap(sql => {
      const trigger = /^CREATE TRIGGER ([A-Za-z_][A-Za-z0-9_]*)/.exec(sql)?.[1]
      return [
        ...(trigger
          ? [
              {
                sql: `DROP TRIGGER IF EXISTS ${trigger}`,
                params: [] as (string | number | null)[],
              },
            ]
          : []),
        { sql, params: [] as (string | number | null)[] },
      ]
    })
  statements.push(receipt)
  return [
    {
      label: 'revision-idle-policy',
      statements,
      tables: ['revisionEditWindow', 'revisionEditSelection', 'd1_migrations'],
    },
  ]
}
