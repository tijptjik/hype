// NODE
import { existsSync } from 'node:fs'

// BUN
import { Database } from 'bun:sqlite'

// CLI
import { parseStatusArgs } from './lib/cli'

interface TableStateRow {
  source: string
  mirror: string
  strategy: string
  cursor: string | null
  sourceRows: bigint | number
  localRows: bigint | number
  pulledRows: bigint | number
  changedRows: bigint | number
  deletedRows: bigint | number
  checkpoint: string | null
}

interface RunRow {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  tableCount: bigint | number
  pulledRows: bigint | number
  changedRows: bigint | number
  deletedRows: bigint | number
  error: string | null
}

interface ChangeSummaryRow {
  firstSequence: bigint | number | null
  lastSequence: bigint | number | null
  changeCount: bigint | number
  upserts: bigint | number
  deletes: bigint | number
}

/**
 * Print persisted mirror checkpoints without contacting production.
 * @returns Nothing.
 */
function main(): void {
  const mirrorPath = parseStatusArgs(process.argv.slice(2))
  if (!existsSync(mirrorPath)) {
    throw new Error(`Breadline mirror does not exist: ${mirrorPath}`)
  }

  const database = new Database(mirrorPath, {
    readonly: true,
    strict: true,
    safeIntegers: true,
  })
  try {
    const states = database
      .prepare<TableStateRow, []>(
        `SELECT sourceSchema || '.' || sourceTable AS source,
                mirrorTable AS mirror,
                strategy,
                cursorColumn AS cursor,
                sourceRows,
                localRows,
                pulledRows,
                changedRows,
                deletedRows,
                checkpoint
           FROM _breadline_sync_state
          ORDER BY sourceSchema, sourceTable`,
      )
      .all()
    const runs = database
      .prepare<RunRow, []>(
        `SELECT id,
                status,
                startedAt,
                completedAt,
                tableCount,
                pulledRows,
                changedRows,
                deletedRows,
                error
           FROM _breadline_sync_run
          ORDER BY startedAt DESC
          LIMIT 10`,
      )
      .all()
    const changes = database
      .prepare<ChangeSummaryRow, []>(
        `SELECT min(sequence) AS firstSequence,
                max(sequence) AS lastSequence,
                count(*) AS changeCount,
                count(*) FILTER (WHERE operation = 'upsert') AS upserts,
                count(*) FILTER (WHERE operation = 'delete') AS deletes
           FROM _breadline_change`,
      )
      .get()
    console.log(`Mirror: ${mirrorPath}`)
    console.table(states)
    console.log('Downstream change journal')
    console.table(changes ? [changes] : [])
    console.log('Recent runs')
    console.table(runs)
  } finally {
    database.close()
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
