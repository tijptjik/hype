// NODE
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// BUN
import { Database } from 'bun:sqlite'

export type ImportTarget = 'local' | 'production'

/** A conversion stage owns deterministic, retry-safe SQL and reconciliation. */
export interface ConversionStage {
  name: string
  version: string
  /** Read only from the snapshot. Return idempotent SQL; never log row payloads. */
  convert: (snapshot: Database) => Promise<string[]>
}

/**
 * Resolve explicit Wrangler routing for one Hype target.
 * @param target Destination selected by the operator.
 * @returns CLI arguments which never infer a remote target from environment values.
 */
export function targetArguments(target: ImportTarget): string[] {
  if (target === 'local')
    return ['hype-db-local', '--local', '--config', 'wrangler.local.toml']
  if (target === 'production')
    return [
      'hype-db-prod',
      '--remote',
      '--env',
      'production',
      '--config',
      'wrangler.toml',
    ]
  throw new Error('Target must be local or production')
}

/**
 * Convert a consistent local snapshot without opening the source or destination.
 * @param snapshotPath Immutable backup selected for conversion.
 * @param stages Reviewed, versioned conversion stages in dependency order.
 * @returns SQL statements ready for an explicit target apply.
 * @remarks Empty registries fail closed until mappings have been reviewed.
 */
export async function convertSnapshot(
  snapshotPath: string,
  stages: readonly ConversionStage[],
): Promise<string[]> {
  if (stages.length === 0)
    throw new Error('No reviewed conversion stages registered; import is disabled.')
  const snapshot = new Database(snapshotPath, { readonly: true })
  try {
    const statements: string[] = []
    for (const stage of stages) statements.push(...(await stage.convert(snapshot)))
    if (statements.length === 0)
      throw new Error('Conversion produced no statements; nothing to import.')
    return statements
  } finally {
    snapshot.close()
  }
}

/**
 * Persist conversion output privately for review before importing.
 * @param path Unique destination file (must not already exist).
 * @param statements Generated SQL statements.
 * @returns Absolute file path.
 */
export function writeImportPlan(path: string, statements: string[]): string {
  const output = resolve(path)
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  writeFileSync(output, statements.join('\n'), { mode: 0o600, flag: 'wx' })
  return output
}

/**
 * Back up the selected Hype database before executing a reviewed conversion.
 * @param target Explicit local or production destination.
 * @param sqlPath Private conversion output to apply.
 * @param backupPath Unique destination backup file.
 * @returns Nothing; failures abort without printing SQL or subprocess output.
 * @remarks Stages must be retry-safe: a failed multi-statement import may be partial.
 */
export async function applyImport(
  target: ImportTarget,
  sqlPath: string,
  backupPath: string,
): Promise<void> {
  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 })
  for (const args of [
    [
      'export',
      ...targetArguments(target),
      '--output',
      backupPath,
      '--skip-confirmation',
    ],
    ['execute', ...targetArguments(target), '--file', sqlPath, '--yes'],
  ]) {
    const child = Bun.spawn(['bun', 'run', 'wrangler', 'd1', ...args], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    if ((await child.exited) !== 0)
      throw new Error(
        `D1 ${args[0]} failed; private output suppressed. Check target access and schema before retrying.`,
      )
    if (args[0] === 'export') {
      chmodSync(backupPath, 0o600)
      if (statSync(backupPath).size === 0)
        throw new Error('Target backup is empty; import aborted.')
    }
  }
}
