// NODE
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
// PIPELINE
import { backupMirror } from './lib/backup'
import {
  applyImport,
  convertSnapshot,
  writeImportPlan,
  type ImportTarget,
} from './lib/pipeline'
import { conversionStages } from './stages'

/**
 * Prepare a private SQL plan; apply only when the operator explicitly requests it.
 * @returns Nothing.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const args = process.argv.slice(2)
  let target: ImportTarget | undefined
  let mirror = '.local/breadline/mirror.sqlite'
  let apply = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target') {
      const value = args[++i]
      if (value !== 'local' && value !== 'production') throw new Error('Invalid target')
      target = value
    } else if (args[i] === '--mirror') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error('Missing mirror path')
      mirror = value
    } else if (args[i] === '--apply') apply = true
    else throw new Error('Unknown option')
  }
  if (!target) throw new Error('An explicit --target local|production is required')
  if (conversionStages.length === 0)
    throw new Error('No reviewed conversion stages registered; import is disabled.')
  const snapshot = backupMirror(resolve(mirror))
  const statements = await convertSnapshot(snapshot, conversionStages)
  const runId = randomUUID()
  const plan = writeImportPlan(
    `.local/breadline/plans/${target}-${runId}.sql`,
    statements,
  )
  console.log(`Prepared ${statements.length} statements for ${target}: ${plan}`)
  if (apply) {
    await applyImport(
      target,
      plan,
      resolve(`.local/breadline/backups/hype-${target}-${runId}.sql`),
    )
    console.log(`Applied conversion to ${target}`)
  }
}

main().catch(() => {
  console.error(
    'Import did not complete. Use --target local|production [--mirror path] [--apply]. Reviewed conversion stages are required; details are suppressed to protect source data.',
  )
  process.exitCode = 1
})
