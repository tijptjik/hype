// CONFIG
import {
  createBreadlineSource,
  formatBreadlineError,
  loadBreadlineDatabaseConfig,
} from './lib/config'
import { parseSyncArgs } from './lib/cli'

// MIRROR
import { syncBreadlineMirror } from './lib/mirror'

/**
 * Pull the Breadline PostgreSQL source into the durable local SQLite mirror.
 * @returns Nothing.
 */
async function main(): Promise<void> {
  const options = parseSyncArgs(process.argv.slice(2))
  const config = loadBreadlineDatabaseConfig()
  const source = createBreadlineSource(config)

  try {
    await source.connect()
    const results = await syncBreadlineMirror(source, options)
    console.table(
      results.map(result => ({
        source: result.sourceTable,
        mirror: result.mirrorTable,
        strategy: result.strategy,
        sourceRows: result.sourceRows,
        pulledRows: result.pulledRows,
        changedRows: result.changedRows,
        deletedRows: result.deletedRows,
        checkpoint: result.checkpoint,
      })),
    )
    console.log(`Breadline mirror synchronized: ${options.mirrorPath}`)
  } finally {
    await source.close({ timeout: 1 })
  }
}

main().catch(error => {
  console.error(`Breadline mirror sync failed: ${formatBreadlineError(error)}`)
  process.exitCode = 1
})
