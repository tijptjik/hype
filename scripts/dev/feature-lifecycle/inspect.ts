// BUN
import { Database } from 'bun:sqlite'
// NODE
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
// DOMAIN
import { FeatureRevisionContentSchema } from '../../../src/lib/revisions/featureContent'
import {
  applyFeatureChanges,
  buildFeatureChanges,
} from '../../../src/lib/revisions/featureChanges'
import { equalRevisionValue } from '../../../src/lib/revisions/value'

// TABLE OF CONTENTS
// 1. Read-only lossless conversion inventory
// 2. Command-line report

type Row = Record<string, string | number | null>

/** Inspect a source database and derive exact partial proposal/review evidence without modifying it.
 * @param sourcePath Existing SQLite database path. @returns Private conversion artifact and public-safe counts/issues.
 * @remarks This is a preparation tool, not a migration runner. Retained legacy snapshots must not be deleted while image/review references depend on them.
 */
export function inspectFeatureLifecycleConversion(sourcePath: string): {
  summary: {
    counts: Record<string, number>
    convertibleProposals: number
    convertibleReviews: number
    issues: string[]
  }
  proposals: Row[]
  reviews: Row[]
  uploads: Row[]
  baseline: Row[]
  identityEvidence: Record<string, Row[]>
  sourceHashes: Record<string, string>
} {
  const db = new Database(sourcePath, { readonly: true })
  try {
    db.exec('BEGIN')
    const tables = [
      'feature',
      'featureRevision',
      'featureRevisionHead',
      'featurePrivateCapture',
      'featureRevisionPublication',
      'featureRevisionProposal',
      'featureRevisionReview',
      'featureInitialRevision',
      'featureImageUploadRevision',
      'featureBaselineAttribution',
      'featureIdentityOperation',
      'featureIdentityOperationMember',
      'featureIdentityProposal',
      'featureIdentityProposalDecision',
      'featureIdentityReservation',
      'featureTaskTransfer',
      'featureTaskUploadTransfer',
      'imageRevision',
      'imageAssetVersion',
      'featureRevisionImage',
      'task',
    ]
    const source: Record<string, Row[]> = {},
      counts: Record<string, number> = {},
      sourceHashes: Record<string, string> = {}
    for (const table of tables) {
      source[table] = db.query(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Row[]
      counts[table] = source[table].length
      sourceHashes[table] = createHash('sha256')
        .update(JSON.stringify(source[table]))
        .digest('hex')
    }
    const revisions = new Map(source.featureRevision.map(row => [row.id, row]))
    const originalProposals = new Map(
      source.featureRevisionProposal.map(row => [row.id, row]),
    )
    const initial = new Map(
      source.featureInitialRevision.map(row => [row.proposalId, row]),
    )
    const issues: string[] = [],
      proposals: Row[] = [],
      reviews: Row[] = []
    // Reconstruct each old proposal version from its immutable base; verify applying the delta recovers the exact candidate.
    const changes = (baseId: Row['id'], candidateId: Row['id']): string => {
      const baseRow = revisions.get(baseId),
        candidateRow = revisions.get(candidateId)
      if (!baseRow || !candidateRow || baseRow.featureId !== candidateRow.featureId)
        throw new Error('Missing or mismatched revision owner')
      const base = FeatureRevisionContentSchema.parse(
        JSON.parse(String(baseRow.content)),
      )
      const candidate = FeatureRevisionContentSchema.parse(
        JSON.parse(String(candidateRow.content)),
      )
      const delta = buildFeatureChanges(base, candidate),
        result = applyFeatureChanges(base, base, delta)
      if (result.status !== 'ready' || !equalRevisionValue(result.content, candidate))
        throw new Error('Partial conversion did not recover exact candidate')
      return JSON.stringify(delta)
    }
    for (const row of source.featureRevisionProposal) {
      try {
        const { candidateRevisionId, ...rest } = row
        // Preserve existing initial identities and evidence during conversion. Future creation proposals have no Feature row.
        proposals.push({
          ...rest,
          kind: 'update',
          version: candidateRevisionId,
          changes: changes(row.baseRevisionId, candidateRevisionId),
          creationScope: initial.has(row.id)
            ? JSON.stringify({ legacyInitial: initial.get(row.id) })
            : null,
        })
      } catch (error) {
        issues.push(
          `Proposal ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    for (const row of source.featureRevisionReview) {
      try {
        const proposal = originalProposals.get(row.proposalId)
        if (!proposal) throw new Error('Missing proposal')
        const { candidateRevisionId, ...rest } = row
        reviews.push({
          ...rest,
          proposalVersion: candidateRevisionId,
          changes: changes(proposal.baseRevisionId, candidateRevisionId),
        })
      } catch (error) {
        issues.push(
          `Review ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    const uploads = source.featureImageUploadRevision.map(
      ({ candidateRevisionId, ...row }) => ({
        ...row,
        proposalVersion: candidateRevisionId,
      }),
    )
    const identityEvidence = Object.fromEntries(
      [
        'featureIdentityOperation',
        'featureIdentityOperationMember',
        'featureIdentityProposal',
        'featureIdentityProposalDecision',
        'featureIdentityReservation',
        'featureTaskTransfer',
        'featureTaskUploadTransfer',
      ].map(table => [table, source[table]]),
    )
    db.exec('ROLLBACK')
    return {
      summary: {
        counts,
        convertibleProposals: proposals.length,
        convertibleReviews: reviews.length,
        issues,
      },
      proposals,
      reviews,
      uploads,
      baseline: source.featureBaselineAttribution,
      identityEvidence,
      sourceHashes,
    }
  } finally {
    db.close()
  }
}

if (import.meta.main) {
  const [sourcePath, outputPath] = process.argv.slice(2)
  if (!sourcePath || !outputPath)
    throw new Error(
      'Usage: bun scripts/dev/feature-lifecycle/inspect.ts SOURCE.sqlite PRIVATE-OUTPUT.json',
    )
  const result = inspectFeatureLifecycleConversion(sourcePath)
  writeFileSync(outputPath, JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: 'wx',
  })
  console.log(JSON.stringify(result.summary, null, 2))
  if (result.summary.issues.length) process.exitCode = 1
}
