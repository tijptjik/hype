// PIPELINE
import { backupMirror } from './lib/backup'
import { parseStatusArgs } from './lib/cli'

try {
  process.umask(0o077)
  console.log(
    `Verified mirror backup: ${backupMirror(parseStatusArgs(process.argv.slice(2)))}`,
  )
} catch {
  console.error(
    'Mirror backup failed; no source refresh or target import was attempted.',
  )
  process.exitCode = 1
}
