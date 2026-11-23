// BUN
import type { Database } from 'bun:sqlite'

/** Reviewed fallback ownership for collections whose source volunteer is missing. */
export const RUN_ATTRIBUTION_RULE = {
  id: 'unassigned-collected-runs-to-daisy-v1',
  sourceUserId: 6279,
  volunteerId: 6323,
} as const

const runsTable = 'breadline__public__runs'
const eligible = 'r.volunteer_id IS NULL AND r.collected_amount IS NOT NULL'

/**
 * Build the import projection while verifying the reviewed destination still exists.
 * @param db Breadline source mirror.
 * @returns SQL selecting effective run ownership without changing source evidence.
 * @remarks Existing owners and NULL collection amounts are never overridden.
 */
function importRunSelect(db: Database): string {
  const count = db
    .query(`SELECT count(*) AS n FROM ${runsTable} r WHERE ${eligible}`)
    .get() as { n: number | bigint }
  if (Number(count.n) > 0) {
    // Pin both source identifiers so another same-name account cannot receive history.
    const owner = db
      .query(`SELECT u.id FROM breadline__public__users u
        JOIN breadline__public__volunteers v ON v.id = u.volunteer_id
        WHERE u.id = ? AND v.id = ?`)
      .get(RUN_ATTRIBUTION_RULE.sourceUserId, RUN_ATTRIBUTION_RULE.volunteerId)
    if (!owner) throw new Error('Reviewed Daisy Tam run attribution owner is missing')
  }

  const columns = db.query(`PRAGMA table_info(${runsTable})`).all() as {
    name: string
  }[]
  const projection = columns.map(({ name }) => {
    const quoted = `"${name.replaceAll('"', '""')}"`
    return name === 'volunteer_id'
      ? `CASE WHEN ${eligible} THEN ${RUN_ATTRIBUTION_RULE.volunteerId} ELSE r.volunteer_id END AS ${quoted}`
      : `r.${quoted}`
  })
  return `SELECT ${projection.join(', ')} FROM ${runsTable} r`
}

/**
 * Read import-ready runs, including from older exports without the installed views.
 * @param db Read-only source snapshot.
 * @returns Runs with reviewed fallback attribution applied.
 * @remarks Source hashes, timestamps, amounts, claimed flags and counters stay original.
 */
export function readImportRuns(db: Database): Record<string, unknown>[] {
  return db.query(importRunSelect(db)).all() as Record<string, unknown>[]
}

/**
 * Install repeatable import and audit views after a successful source-table pull.
 * @param db Writable mirror inside the caller's transaction.
 * @returns Number of runs receiving fallback attribution, or zero for a place-only export.
 * @remarks Raw tables and their change journal remain faithful to PostgreSQL.
 */
export function installRunAttributionViews(db: Database): number {
  // Donor eligibility exports need raw runs but deliberately omit user identities.
  if (
    [runsTable, 'breadline__public__users', 'breadline__public__volunteers'].some(
      table =>
        !db
          .query('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
          .get('table', table),
    )
  ) {
    db.run('DROP VIEW IF EXISTS _breadline_import_runs')
    db.run('DROP VIEW IF EXISTS _breadline_run_attribution')
    return 0
  }
  const select = importRunSelect(db)
  db.run('DROP VIEW IF EXISTS _breadline_import_runs')
  db.run(`CREATE VIEW _breadline_import_runs AS ${select}`)
  db.run('DROP VIEW IF EXISTS _breadline_run_attribution')
  db.run(`CREATE VIEW _breadline_run_attribution AS
    SELECT r.id AS runId, r.volunteer_id AS sourceVolunteerId,
      ${RUN_ATTRIBUTION_RULE.volunteerId} AS importVolunteerId,
      ${RUN_ATTRIBUTION_RULE.sourceUserId} AS sourceUserId,
      '${RUN_ATTRIBUTION_RULE.id}' AS rule
    FROM ${runsTable} r WHERE ${eligible}`)
  const count = db
    .query('SELECT count(*) AS n FROM _breadline_run_attribution')
    .get() as {
    n: number | bigint
  }
  return Number(count.n)
}
