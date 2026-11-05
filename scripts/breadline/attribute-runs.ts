// BUN
import { Database } from 'bun:sqlite'
// BREADLINE
import { backupMirror } from './lib/backup'
import { parseStatusArgs } from './lib/cli'
import { installRunAttributionViews } from './lib/run-attribution'

/**
 * Add reviewed run-attribution views to an existing export without a source refresh.
 * @returns Nothing; logs a verified backup and aggregate attribution count.
 */
function main(): void {
  process.umask(0o077)
  const path = parseStatusArgs(process.argv.slice(2))
  console.log(`Verified pre-attribution backup: ${backupMirror(path)}`)
  const db = new Database(path, { readwrite: true })
  try {
    const count = db.transaction(() => installRunAttributionViews(db))()
    console.log(`Import runs attributed to Daisy Tam: ${count}`)
  } finally {
    db.close()
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Run attribution failed')
  process.exitCode = 1
}
