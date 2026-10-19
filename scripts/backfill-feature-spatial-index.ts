// NODE
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
// ZOD
import { z } from 'zod'
// BACKFILL
import {
  featureSpatialBackfillSelect,
  featureSpatialBackfillStatements,
} from './lib/feature-spatial-backfill'
// TYPES
import type { FeatureSpatialBackfillRow } from '#lib/db/services/featureSpatial.types.js'
// TYPES

/** Explicit target and bounded traversal for resumable spatial-index backfills. */
type FeatureSpatialBackfillOptions = {
  stage: 'local' | 'preview' | 'production'
  remote: boolean
  batchSize: number
  maxBatches: number
  afterId: string
  dryRun: boolean
  requireComplete: boolean
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. OPTIONS AND DATABASE ACCESS
// - parseFeatureSpatialBackfillOptions
// - executeSql
// 2. BOUNDED BACKFILL
// - runFeatureSpatialBackfill
// ---

const execFileAsync = promisify(execFile)
const queryResult = z.array(
  z.object({
    success: z.boolean(),
    results: z.array(z.record(z.string(), z.unknown())).default([]),
    meta: z.object({ changes: z.number().optional() }).passthrough().optional(),
  }),
)
const pendingRow = z.object({ id: z.string(), geometry: z.string() })

// ---
/********************
 *  1. OPTIONS AND DATABASE ACCESS
 ************/
// +++ Options And Database Access

/**
 * Parses the explicit local/remote target and bounded resume options.
 * @param args CLI arguments after the script name.
 * @returns Validated execution options.
 * @remarks Remote execution requires both --remote and --stage; default is local.
 */
export function parseFeatureSpatialBackfillOptions(
  args: string[],
): FeatureSpatialBackfillOptions {
  const value = (flag: string, fallback: string): string => {
    const position = args.indexOf(flag)
    if (position === -1) return fallback
    const supplied = args[position + 1]
    if (!supplied || supplied.startsWith('--'))
      throw new Error(`Missing value for ${flag}`)
    return supplied
  }
  const known = new Set([
    '--remote',
    '--stage',
    '--batch-size',
    '--max-batches',
    '--after-id',
    '--dry-run',
    '--require-complete',
  ])
  for (const arg of args)
    if (arg.startsWith('--') && !known.has(arg))
      throw new Error(`Unknown option ${arg}`)
  const stage = z
    .enum(['local', 'preview', 'production'])
    .parse(value('--stage', 'local'))
  const remote = args.includes('--remote')
  if (remote && stage === 'local')
    throw new Error('--remote requires --stage preview or production')
  if (!remote && stage !== 'local')
    throw new Error('--stage preview or production requires --remote')
  return {
    stage,
    remote,
    batchSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(value('--batch-size', '25')),
    maxBatches: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(value('--max-batches', '20')),
    afterId: value('--after-id', ''),
    dryRun: args.includes('--dry-run'),
    requireComplete: args.includes('--require-complete'),
  }
}

/**
 * Executes explicit-target SQL through Wrangler's existing authentication setup.
 * @param options Validated target.
 * @param sql SQL text built from stored values with SQL quoting.
 * @returns Parsed successful D1 statement results.
 */
async function executeSql(
  options: FeatureSpatialBackfillOptions,
  sql: string,
): Promise<z.infer<typeof queryResult>> {
  const databaseName =
    options.stage === 'production' ? 'hype-db-prod' : `hype-db-${options.stage}`
  const args = [
    'wrangler',
    'd1',
    'execute',
    databaseName,
    options.remote ? '--remote' : '--local',
    '--json',
    '--command',
    sql,
  ]
  if (options.remote) args.push('--env', options.stage)
  // argv preserves SQL as data; no shell interprets stored geometry or feature IDs.
  // Conditional writes are idempotent, so short local D1 lock retries cannot overwrite edits.
  for (let attempt = 0; ; attempt++) {
    try {
      const { stdout } = await execFileAsync('bun', args, {
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      })
      const results = queryResult.parse(JSON.parse(stdout))
      if (results.some(result => !result.success))
        throw new Error('D1 spatial backfill statement failed')
      return results
    } catch (error) {
      let message = 'D1 spatial backfill command failed'
      if (
        error &&
        typeof error === 'object' &&
        'stdout' in error &&
        typeof error.stdout === 'string'
      ) {
        try {
          const output = z
            .object({ error: z.object({ text: z.string() }) })
            .parse(JSON.parse(error.stdout))
          message = output.error.text
        } catch {
          /* Keep the concise error; subprocess arguments contain the full SQL payload. */
        }
      } else if (error instanceof Error) message = error.message
      if (attempt < 3 && /SQLITE_BUSY|database is locked/.test(message)) {
        await delay(200 * (attempt + 1))
        continue
      }
      throw new Error(message)
    }
  }
}

// ---
/********************
 *  2. BOUNDED BACKFILL
 ************/
// +++ Bounded Backfill

/**
 * Processes a bounded number of missing spatial-index pages and prints resume state.
 * @param options Validated target and execution limits.
 * @returns Resolves after exhaustion or the configured work budget.
 * @remarks --require-complete fails deployment on remaining points or exhausted work.
 * Re-running without --after-id is safe: indexed rows leave the pending
 * index. Use --after-id from progress output to skip invalid rows within a run.
 * Apply migration 0078 before this script. Remote migrations/backfills are explicit
 * operator actions and are never invoked by application startup.
 */
export async function runFeatureSpatialBackfill(
  options: FeatureSpatialBackfillOptions,
): Promise<void> {
  let afterId = options.afterId
  let indexed = 0
  let skipped = 0
  console.log(
    `[feature:spatial:backfill] target=${options.remote ? 'remote' : 'local'}:${options.stage} dryRun=${options.dryRun} batch=${options.batchSize} maxBatches=${options.maxBatches}`,
  )
  for (let batch = 0; batch < options.maxBatches; batch++) {
    const result = await executeSql(
      options,
      featureSpatialBackfillSelect(afterId, options.batchSize),
    )
    const rows: FeatureSpatialBackfillRow[] = z
      .array(pendingRow)
      .parse(result[0]?.results ?? [])
    if (rows.length === 0) {
      // Deployment readiness is global: a resume cursor must not hide skipped points.
      if (options.requireComplete) {
        const readiness = await executeSql(
          options,
          "SELECT count(*) AS pending FROM feature WHERE spatialIndex IS NULL AND json_extract(geometry, '$.type') = 'Point'",
        )
        if (Number(readiness[0]?.results[0]?.pending ?? NaN) !== 0)
          throw new Error(
            'Spatial preparation incomplete: point features still lack indexes',
          )
      }
      console.log(
        JSON.stringify({
          complete: true,
          indexed,
          skipped,
          afterId,
          dryRun: options.dryRun,
        }),
      )
      return
    }
    const statements = featureSpatialBackfillStatements(rows)
    skipped += rows.length - statements.length
    if (!options.dryRun && statements.length) {
      const written = await executeSql(options, statements.join('\n'))
      indexed += written.reduce(
        (count, statement) => count + statement.results.length,
        0,
      )
    }
    afterId = rows[rows.length - 1]!.id
    console.log(
      JSON.stringify({
        batch: batch + 1,
        selected: rows.length,
        valid: statements.length,
        indexed,
        skipped,
        afterId,
        dryRun: options.dryRun,
      }),
    )
  }
  console.log(
    JSON.stringify({
      complete: false,
      reason: 'batch_budget',
      indexed,
      skipped,
      afterId,
      resume: ['--after-id', afterId],
    }),
  )
  if (options.requireComplete)
    throw new Error(
      'Spatial preparation exhausted its batch budget; resume before deployment',
    )
}

if (import.meta.main)
  await runFeatureSpatialBackfill(
    parseFeatureSpatialBackfillOptions(process.argv.slice(2)),
  )
// ---
