// NODE
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// ROLLOUT
import { openSqliteDomain } from '../../../scripts/locations/lib/sqlite-domain'
import {
  applyGroups,
  journal,
  markVerified,
  pause,
  verifyRows,
  verifySchema,
} from '../../../scripts/revisions/production/contract'
import type { Plan } from '../../../scripts/revisions/production/contract'

/** Exercise the production journal on an isolated SQLite copy, including a stale install
 * and resume. @param source Schema-current pre-curation snapshot. @param planFile Managed
 * planner output. @param directory Fresh private output path. @returns Verification receipt.
 */
async function rehearse(
  source: string,
  planFile: string,
  directory: string,
): Promise<void> {
  process.umask(0o077)
  if (existsSync(directory)) throw new Error('Output directory must be new')
  mkdirSync(directory, { mode: 0o700 })
  const file = join(directory, 'database.sqlite')
  const backup = spawnSync('python3', [
    '-c',
    'import pathlib,sqlite3,sys; s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
    source,
    file,
  ])
  if (backup.status !== 0) throw new Error('Private rehearsal backup failed')
  const plan: Plan = JSON.parse(readFileSync(planFile, 'utf8'))
  const install = plan.groups.findIndex(group => group.label === 'curation/install')
  if (install < 1) throw new Error('Expected a curation installation group')
  const domain = openSqliteDomain(file)
  try {
    await verifySchema(domain.binding, plan.initialSchema)
    await verifyRows(domain.binding, plan.initial)
    await pause(domain.binding, plan)
    await applyGroups(domain.binding, plan, install)
    const table = '_matchingBrandingReleaseRows'
    const row = domain.sqlite
      .query<{ ord: number; b: string }, []>(
        'SELECT ord,b FROM ' +
          table +
          " WHERE tbl='identityCatalogue' AND op LIKE 'update:%' LIMIT 1",
      )
      .get()
    if (!row) throw new Error('Expected a catalogue before-image')
    let rejected = false
    try {
      domain.sqlite.query('UPDATE ' + table + ' SET b=b WHERE ord=?').run(row.ord)
    } catch (error) {
      rejected = String(error).includes('REVISION_DEPLOYMENT_MAINTENANCE')
    }
    if (!rejected) throw new Error('Staging table accepted an unfenced write')
    // Inject stale evidence solely in the disposable fixture to exercise transaction rollback.
    function replaceBefore(value: string): void {
      domain.sqlite.transaction(() => {
        domain.sqlite.exec('UPDATE _revisionDeployment SET writable=1')
        domain.sqlite
          .query('UPDATE ' + table + ' SET b=? WHERE ord=?')
          .run(value, row!.ord)
        domain.sqlite.exec('UPDATE _revisionDeployment SET writable=0')
      })()
    }
    replaceBefore(JSON.stringify({ ...JSON.parse(row.b), version: -1 }))
    let staleRejected = false
    try {
      await applyGroups(domain.binding, plan)
    } catch (error) {
      staleRejected = String(error).includes('malformed JSON')
    }
    const stopped = await journal(domain.binding)
    if (!staleRejected || stopped?.nextGroup !== install || stopped.writable !== 0)
      throw new Error('Stale installation did not roll back to the fenced stage cursor')
    await verifyRows(domain.binding, plan.initial)
    replaceBefore(row.b)
    await applyGroups(domain.binding, plan)
    await markVerified(domain.binding, plan)
    const verified = await journal(domain.binding)
    const receipt = {
      stageFence: true,
      staleRejected,
      cursorAfterRollback: install,
      verified,
      expectedTables: Object.keys(plan.expected).length,
    }
    writeFileSync(
      join(directory, 'verification.json'),
      JSON.stringify(receipt, null, 2) + '\n',
    )
    console.log(JSON.stringify(receipt))
  } finally {
    domain.close()
  }
}
const [source, planFile, directory] = process.argv.slice(2)
if (!source || !planFile || !directory)
  throw new Error('Usage: rehearse-journal.ts SOURCE.sqlite PLAN.json NEW_DIRECTORY')
await rehearse(source, planFile, directory)
