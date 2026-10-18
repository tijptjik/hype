// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// CONFIG
import {
  createBreadlineSource,
  formatBreadlineError,
  loadBreadlineDatabaseConfig,
} from './lib/config'
import { parseInspectArgs } from './lib/cli'

// SOURCE
import { inspectSourceSchema } from './lib/source'

/**
 * Inspect the Breadline source without reading or printing row payloads.
 * @returns Nothing.
 */
async function main(): Promise<void> {
  const options = parseInspectArgs(process.argv.slice(2))
  const config = loadBreadlineDatabaseConfig()
  const source = createBreadlineSource(config)

  try {
    await source.connect()
    const report = await source.begin(
      'isolation level repeatable read read only',
      async snapshot => {
        await snapshot.unsafe(`SET LOCAL TIME ZONE 'UTC'`)
        return await inspectSourceSchema(snapshot, options.schemas)
      },
    )
    mkdirSync(dirname(options.outputPath), { recursive: true })
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    })

    console.table(
      report.tables.map(table => ({
        table: `${table.schema}.${table.name}`,
        estimatedRows: table.estimatedRows,
        primaryKey: table.primaryKey.join(', ') || 'none',
        cursor: table.incremental.cursorColumn || 'none',
        cursorEvidence: table.incremental.cursorMaintenanceEvidence,
        strategy: table.incremental.strategy,
      })),
    )
    console.log(`Schema report: ${options.outputPath}`)
  } finally {
    await source.close({ timeout: 1 })
  }
}

main().catch(error => {
  console.error(`Breadline schema inspection failed: ${formatBreadlineError(error)}`)
  process.exitCode = 1
})
