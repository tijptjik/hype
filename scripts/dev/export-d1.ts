// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. BACKUP PLAN
// - planD1Export
// - completeD1Export
// 2. REMOTE EXPORT
// - readSchema
// - schemaObjects
// - main
// ---

// NODE
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'

/********************
 *  1. BACKUP PLAN
 ************/
// +++ Backup Plan

interface SchemaObject {
  type: string
  name: string
  sql: string
}

interface ExportPlan {
  tables: string[]
  objects: SchemaObject[]
  beforeDataSql: string
  afterDataSql: string
  rebuildSearch: boolean
}

/**
 * Plan a single explicit-table export and the schema restored after canonical rows.
 * @param response Parsed Wrangler sqlite_schema JSON response.
 * @returns Canonical table names and SQL preserving secondary schema and derived search.
 * @remarks Unknown virtual tables fail closed because their contents may not be derived.
 */
export function planD1Export(response: unknown): ExportPlan {
  if (
    !Array.isArray(response) ||
    response.length !== 1 ||
    response[0]?.success !== true ||
    !Array.isArray(response[0].results)
  )
    throw new Error('Invalid D1 schema response')
  const rows: SchemaObject[] = response[0].results.map((row: unknown) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('type' in row) ||
      typeof row.type !== 'string' ||
      !('name' in row) ||
      typeof row.name !== 'string' ||
      !('sql' in row) ||
      typeof row.sql !== 'string'
    )
      throw new Error('Invalid D1 schema object')
    return { type: row.type, name: row.name, sql: row.sql }
  })
  const objects = rows.filter(
    row => !row.name.startsWith('sqlite_') && !row.name.startsWith('_cf_'),
  )
  const virtual = objects.filter(row => /CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql))
  if (
    virtual.some(
      row => row.name !== 'featureSearchFts' || !/USING\s+fts5\s*\(/i.test(row.sql),
    )
  )
    throw new Error('Unknown virtual table: provide an explicit rebuild strategy')
  const shadows = new Set(
    virtual.flatMap(row =>
      ['data', 'idx', 'content', 'docsize', 'config'].map(
        suffix => `${row.name}_${suffix}`,
      ),
    ),
  )
  const canonical = objects
    .filter(
      row => row.type === 'table' && !virtual.includes(row) && !shadows.has(row.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  if (!canonical.length)
    throw new Error('No canonical tables found; refusing a whole-database export')
  const sequence =
    rows.some(row => row.name === 'sqlite_sequence') &&
    canonical.some(row => /\bAUTOINCREMENT\b/i.test(row.sql))
  const tables = [
    ...canonical.map(row => row.name),
    ...(sequence ? ['sqlite_sequence'] : []),
  ]

  // Explicit-table exports omit secondary schema; install triggers only after data and FTS.
  const statements = [
    // Table inserts recreate sequence rows; retain the exported high-water marks too.
    ...(sequence
      ? [
          'UPDATE sqlite_sequence SET seq=(SELECT max(s.seq) FROM sqlite_sequence AS s WHERE s.name=sqlite_sequence.name)',
          'DELETE FROM sqlite_sequence WHERE rowid NOT IN (SELECT min(rowid) FROM sqlite_sequence GROUP BY name)',
        ]
      : []),
    ...virtual.map(row => row.sql),
    ...objects.filter(row => row.type === 'view').map(row => row.sql),
    ...(virtual.length
      ? [
          'INSERT INTO featureSearchFts(rowid, grams) SELECT id, grams FROM featureSearchContent',
        ]
      : []),
    ...objects.filter(row => row.type === 'trigger').map(row => row.sql),
  ]
  return {
    tables,
    objects,
    beforeDataSql: [...canonical, ...objects.filter(row => row.type === 'index')]
      .map(row => `${row.sql.trim().replace(/;$/, '')};`)
      .join('\n\n'),
    afterDataSql: statements
      .map(sql => `${sql.trim().replace(/;$/, '')};`)
      .join('\n\n'),
    rebuildSearch: virtual.length > 0,
  }
}

/**
 * Assemble and rehearse the exact standalone SQL artifact before publishing it.
 * @param canonicalPath Wrangler data-only export of the planned ordinary tables.
 * @param plan Validated schema and rebuild plan.
 * @param outputPath New staging SQL file; never overwrite an existing file.
 * @param retainDatabase Keep the verified SQLite file for a local mirror installation.
 * @returns Number of rebuilt search documents and existing foreign-key violations.
 * @remarks The original SQL bytes and trigger bodies bypass the legacy reorder parser.
 * Foreign-key violations are reported, preserving the source rather than repairing it.
 */
export function completeD1Export(
  canonicalPath: string,
  plan: ExportPlan,
  outputPath: string,
  retainDatabase = false,
): { searchDocuments: number; foreignKeyViolations: number } {
  const sql = `PRAGMA defer_foreign_keys=ON;\n${plan.beforeDataSql}\n\n${readFileSync(canonicalPath, 'utf8')}\n\n-- Secondary schema and derived search; triggers must follow the data.\n${plan.afterDataSql}\n`
  writeFileSync(outputPath, sql, { flag: 'wx', mode: 0o600 })
  const verificationPath = `${outputPath}.verify.sqlite`
  const db = new Database(verificationPath, { create: true, strict: true })
  try {
    // Rehearse the final SQL in a fresh database, preserving source FK defects for inspection.
    db.exec('PRAGMA foreign_keys=OFF; BEGIN')
    db.exec(sql)
    db.exec('COMMIT; PRAGMA foreign_keys=ON')
    const integrity = db
      .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
      .all()
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
      throw new Error('Backup failed SQLite integrity check')
    for (const object of plan.objects) {
      if (
        !db
          .query('SELECT 1 FROM sqlite_schema WHERE type=? AND name=?')
          .get(object.type, object.name)
      )
        throw new Error(
          `Backup is missing schema object: ${object.type} ${object.name}`,
        )
    }
    let searchDocuments = 0
    if (plan.rebuildSearch) {
      db.exec(
        "INSERT INTO featureSearchFts(featureSearchFts) VALUES ('integrity-check')",
      )
      searchDocuments = db
        .query<{ count: number }, []>('SELECT count(*) AS count FROM featureSearchFts')
        .get()!.count
      const expected = db
        .query<{ count: number }, []>(
          'SELECT count(*) AS count FROM featureSearchContent',
        )
        .get()!.count
      if (searchDocuments !== expected)
        throw new Error('Backup search document count mismatch')
    }
    return {
      searchDocuments,
      foreignKeyViolations: db.query('PRAGMA foreign_key_check').all().length,
    }
  } finally {
    db.close()
    if (!retainDatabase) rmSync(verificationPath, { force: true })
  }
}

/********************
 *  2. REMOTE EXPORT
 ************/
// +++ Remote Export

/**
 * Capture only schema metadata through Wrangler's existing authentication.
 * @param target Remote database name and explicit environment arguments.
 * @param path Private output path for metadata or error diagnostics.
 * @returns Parsed schema inventory; remote data is never mutated.
 */
async function readSchema(target: string[], path: string): Promise<unknown> {
  const child = Bun.spawn(
    [
      'bun',
      'wrangler',
      'd1',
      'execute',
      ...target,
      '--command',
      'SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name',
      '--json',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  writeFileSync(path, stdout, { flag: 'wx', mode: 0o600 })
  if (code !== 0) {
    writeFileSync(`${path}.log`, stderr, { mode: 0o600 })
    throw new Error(`Schema inspection failed; inspect ${path}.log`)
  }
  return JSON.parse(stdout)
}

/**
 * Normalize metadata without volatile Wrangler query metrics for the schema drift guard.
 * @param response Wrangler schema response.
 * @returns Validated schema objects sorted by type and name.
 */
function schemaObjects(response: unknown): SchemaObject[] {
  return planD1Export(response).objects.sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
  )
}

/**
 * Export production or preview without dropping their live search tables.
 * @returns Nothing after verified artifacts are published in sql/backup.
 * @remarks Wrangler retains its export availability confirmation unless --yes is passed.
 * Partial attempts never match the existing latest-ordered-backup restore commands.
 */
async function main(): Promise<void> {
  const [environment, ...args] = process.argv.slice(2)
  if (
    !['prod', 'preview'].includes(environment) ||
    args.some(arg => !['--yes', '--mirror-local'].includes(arg)) ||
    (args.includes('--mirror-local') && environment !== 'prod')
  )
    throw new Error(
      'Usage: export-d1.ts <prod|preview> [--yes] [--mirror-local (prod only)]',
    )
  process.umask(0o077)
  const mirrorLocal = args.includes('--mirror-local')
  let destination: string | undefined
  if (mirrorLocal) {
    if (
      process.env.HYPE_DEV_STATE ||
      process.env.CLOUDFLARE_ENV ||
      (process.env.ENVIRONMENT && process.env.ENVIRONMENT !== 'local')
    )
      throw new Error(
        'Unset alternate state/environment: mirror targets normal local development only',
      )
    const config = Bun.TOML.parse(readFileSync('wrangler.local.toml', 'utf8')) as {
      vars: { ENVIRONMENT?: string }
      d1_databases: Array<{ binding: string; remote?: boolean; database_name: string }>
    }
    const bindings = config.d1_databases.filter(row => row.binding === 'DB')
    if (
      bindings.length !== 1 ||
      bindings[0].remote ||
      bindings[0].database_name !== 'hype-db-local' ||
      config.vars.ENVIRONMENT !== 'local'
    )
      throw new Error('Expected the explicit local DB binding')
    const namespace = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
    const candidates = readdirSync(namespace).filter(name =>
      /^[a-f0-9]{64}\.sqlite$/.test(name),
    )
    if (candidates.length !== 1)
      throw new Error('Expected exactly one normal local D1 database')
    destination = resolve(namespace, candidates[0])
  }
  const name = `hype-db-${environment}`
  const target = [
    name,
    '--remote',
    '--env',
    environment === 'prod' ? 'production' : 'preview',
    '--config',
    'wrangler.toml',
  ]
  const root = resolve('sql/backup')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const timestamp = new Date().toISOString().replaceAll(':', '-')
  const stage = mkdtempSync(join(root, `.${name}-${timestamp}-`))
  const base = join(root, basename(stage).slice(1))
  try {
    const schema = await readSchema(target, join(stage, 'schema.json'))
    const plan = planD1Export(schema)
    const canonical = join(stage, 'canonical.sql')
    console.info(
      `Exporting ${plan.tables.length} canonical tables; derived search will be rebuilt on restore.`,
    )
    // One export captures all canonical rows together; never export tables in separate snapshots.
    const child = Bun.spawn(
      [
        'bun',
        'wrangler',
        'd1',
        'export',
        ...target,
        '--no-schema',
        '--output',
        canonical,
        ...(args.includes('--yes') ? ['--skip-confirmation'] : []),
        ...plan.tables.flatMap(table => ['--table', table]),
      ],
      { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) throw new Error('D1 export failed')
    const after = await readSchema(target, join(stage, 'schema-after.json'))
    if (JSON.stringify(schemaObjects(schema)) !== JSON.stringify(schemaObjects(after)))
      throw new Error(
        'Remote schema changed during export; retry after migrations finish',
      )
    console.info('Rehearsing standalone SQL restore and rebuilding search locally…')
    const output = join(stage, 'complete.sql')
    const verification = completeD1Export(canonical, plan, output, mirrorLocal)

    if (mirrorLocal) {
      if (verification.foreignKeyViolations)
        throw new Error(
          'Production export has foreign-key violations; refusing local installation',
        )
      const backup = `${base}-before-local.sqlite`
      console.info('Installing the verified mirror; the local database must be closed…')
      const install = Bun.spawn(
        [
          'python3',
          'scripts/dev/rebuild-database.py',
          'install',
          `${output}.verify.sqlite`,
          destination!,
          backup,
        ],
        { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
      )
      if ((await install.exited) !== 0)
        throw new Error('Local mirror installation failed')
      console.info(`Previous local database backed up: ${backup}`)
    }

    // Publish the compatibility filename last so restore commands cannot select partial SQL.
    renameSync(join(stage, 'schema.json'), `${base}-schema.json`)
    renameSync(output, `${base}.sql`)
    copyFileSync(`${base}.sql`, join(stage, 'ordered.sql'))
    renameSync(join(stage, 'ordered.sql'), `${base}-ordered.sql`)
    rmSync(stage, { recursive: true })
    console.info(`✅ Exported and restore-verified: ${base}-ordered.sql`)
    console.info(
      `Search documents: ${verification.searchDocuments}; source foreign-key violations: ${verification.foreignKeyViolations}`,
    )
  } catch (error) {
    console.error(`Incomplete backup retained privately at ${stage}`)
    throw error
  }
}

if (import.meta.main) await main()
