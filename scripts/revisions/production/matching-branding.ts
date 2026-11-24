// NODE
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
// ROLLOUT
import { fences } from './contract'
// TYPES
import type { Database } from 'bun:sqlite'
import type { Group } from './contract'

const source = 'migrations/pending/matching-and-branding'
const inputs = [
  'records.jsonl.gz',
  'curation.json',
  'media.json',
  'production-baseline.json.gz',
  'donor-phones.json.gz',
] as const

/** Pin the private release data for all preparations and retries in this run.
 * @param directory Managed run directory. @param provided Explicit operator-selected package.
 * @returns Retained input directory, if this run includes the package.
 */
export function retainMatchingBranding(
  directory: string,
  provided?: string,
): string | undefined {
  const retained = join(directory, 'matching-and-branding')
  if (!provided && !existsSync(retained)) return
  const hashes = JSON.parse(readFileSync(join(source, 'release.json'), 'utf8'))
    .files as Record<string, string>
  function verify(path: string): void {
    for (const file of inputs)
      if (
        createHash('sha256')
          .update(readFileSync(join(path, file)))
          .digest('hex') !== hashes[file]
      )
        throw new Error(
          'Matching and branding package differs from release manifest: ' + file,
        )
  }
  // The MTR operator sprite is delivered with the application at its original path.
  function verifyStatic(path: string): void {
    const { static: assets } = JSON.parse(
      readFileSync(join(path, 'media.json'), 'utf8'),
    ) as { static: Record<string, string> }
    for (const [file, hash] of Object.entries(assets)) {
      if (
        !/^(brands|mapSprites)\/[a-zA-Z0-9_./-]+$/.test(file) ||
        file.split('/').includes('..') ||
        createHash('sha256')
          .update(readFileSync(join('static', file)))
          .digest('hex') !== hash
      )
        throw new Error('Bundled curation artwork differs: ' + file)
    }
  }
  if (provided) {
    verify(provided)
    if (!existsSync(retained)) {
      const pending = mkdtempSync(join(directory, '.curation-'))
      for (const file of inputs) copyFileSync(join(provided, file), join(pending, file))
      renameSync(pending, retained)
    }
  }
  if (!existsSync(retained)) return
  verify(retained)
  verifyStatic(retained)
  return retained
}

/** Prepare target-specific curation groups and replay them on the cutover's post-schema copy.
 * @param db Open private preparation database. @param database Its backing SQLite file.
 * @param directory Private release directory. @param input Retained and verified curation package.
 * @returns Rehearsed D1 batches for the existing fenced journal.
 */
export function prepareMatchingBranding(
  db: Database,
  database: string,
  directory: string,
  input: string,
): Group[] {
  const output = join(directory, 'curation')
  const result = spawnSync(
    'python3',
    [join(source, 'package.py'), 'prepare', input, database, output],
    { encoding: 'utf8' },
  )
  writeFileSync(
    join(directory, 'curation.log'),
    (result.stdout ?? '') + (result.stderr ?? ''),
    { mode: 0o600 },
  )
  if (result.status !== 0)
    throw new Error(
      'Curation target differs or rehearsal failed; inspect ' +
        join(directory, 'curation.log'),
    )
  const groups = JSON.parse(
    readFileSync(join(output, 'groups.json'), 'utf8'),
  ) as Group[]
  // Reapply with Bun SQLite to include the curation in the runner's expected fingerprints.
  for (const group of groups)
    db.transaction(() => {
      for (const entry of group.statements) db.query(entry.sql).run(...entry.params)
    })()
  // The private staging table exists across journal groups. Install its ordinary write fences
  // in the creation transaction. Dropping the table in the installation group removes them.
  groups[0]?.statements.push(...fences(['_matchingBrandingReleaseRows']))
  return groups
}

/** Identify the pinned curation package inside a retained plan, including a zero-write replay.
 * @param path Directory already verified against the release manifest.
 * @returns SHA-256 over the ordered filenames and their verified SHA-256 digests.
 */
export function matchingBrandingHash(path: string): string {
  const digests = inputs.map(file => [
    file,
    createHash('sha256')
      .update(readFileSync(join(path, file)))
      .digest('hex'),
  ])
  return createHash('sha256').update(JSON.stringify(digests)).digest('hex')
}
