// BUN
import { Database as SQLite } from 'bun:sqlite'
// NODE
import { writeFileSync } from 'node:fs'
// DRIZZLE
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// DOMAIN
import { FeatureRevisionContentSchema } from '../../../src/lib/revisions/featureContent'
// SERVICES
import { featureContentProjectionMatches } from '../../../src/lib/db/services/featureRevisionProjection'
// TYPES
import type { FeatureRevisionContent } from '../../../src/lib/revisions/featureContent'
import type { SQLQueryBindings } from 'bun:sqlite'

/** Inspect exact legacy comparison pointers and verify their active content projections before conversion.
 * @param sourcePath Existing SQLite database. @returns Private pointer plan and explicit unresolved identities.
 * @remarks Retired sources deliberately have no live subscriptions; their last consumed input revision remains their historical content.
 */
export async function inspectCurrentFeatureConversion(sourcePath: string): Promise<{
  current: {
    featureId: string
    revisionId: string
    basis: string
    content: FeatureRevisionContent
    projectionAdjustments: string[]
    state: Record<string, unknown>
  }[]
  issues: { featureId: string; reason: string }[]
}> {
  const sqlite = new SQLite(sourcePath, { readonly: true }),
    dialect = new SQLiteSyncDialect()
  try {
    sqlite.exec('BEGIN')
    const records = sqlite
      .query(
        `SELECT f.id,f.organisationId,f.projectId,f.layerId,f.isPublished,f.localIsPublished,f.isArchived,
   h.publishedRevisionId,h.generation,h.state,
   (SELECT revisionId FROM featurePrivateCapture WHERE featureId=f.id AND generation=h.generation ORDER BY sequence DESC LIMIT 1) privateRevisionId,
   (SELECT previousRevisionId FROM featureRevisionPublication WHERE featureId=f.id AND generation=h.generation) previousRevisionId,
   (SELECT r.id FROM featureRevision r JOIN featureRevisionPublication p ON p.featureId=r.featureId AND p.changeSetId=r.changeSetId
    WHERE r.featureId=f.id AND p.generation=0 AND r.previousRevisionId IS NULL) baselineRevisionId,
   (SELECT p.candidateRevisionId FROM featureInitialRevision initial JOIN featureRevisionProposal p ON p.id=initial.proposalId
    WHERE initial.featureId=f.id AND p.status IN ('draft','submitted')) initialCandidateId,
   (SELECT m.revisionId FROM featureIdentityOperationMember m WHERE m.featureId=f.id AND m.role='input'
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember output WHERE output.operationId=m.operationId AND output.featureId=m.featureId AND output.role='output')) retiredRevisionId
   FROM feature f LEFT JOIN featureRevisionHead h ON h.featureId=f.id ORDER BY f.id`,
      )
      .all() as Record<string, string | number | null>[]
    const current: {
        featureId: string
        revisionId: string
        basis: string
        content: FeatureRevisionContent
        projectionAdjustments: string[]
        state: Record<string, unknown>
      }[] = [],
      issues: { featureId: string; reason: string }[] = []
    for (const row of records) {
      const featureId = String(row.id)
      const basis =
        row.state !== 'active'
          ? 'retiredRevisionId'
          : row.publishedRevisionId
            ? 'publishedRevisionId'
            : row.privateRevisionId
              ? 'privateRevisionId'
              : row.generation === 0 && row.initialCandidateId
                ? 'initialCandidateId'
                : row.previousRevisionId
                  ? 'previousRevisionId'
                  : 'baselineRevisionId'
      const revisionId = row[basis]
      if (typeof revisionId !== 'string') {
        issues.push({ featureId, reason: 'No exact current comparison revision' })
        continue
      }
      const revision = sqlite
        .query('SELECT content FROM featureRevision WHERE id=? AND featureId=?')
        .get(revisionId, featureId) as { content: string } | null
      if (!revision) {
        issues.push({ featureId, reason: 'Comparison revision owner is missing' })
        continue
      }
      const parsed = FeatureRevisionContentSchema.safeParse(
        JSON.parse(revision.content),
      )
      if (!parsed.success) {
        issues.push({ featureId, reason: 'Comparison content requires conversion' })
        continue
      }
      const content = parsed.data,
        projectionAdjustments: string[] = []
      if (row.state === 'active') {
        const query = dialect.sqlToQuery(
          sql`SELECT ${featureContentProjectionMatches(featureId, parsed.data)} matches`,
        )
        const matches = sqlite
          .query<{ matches: number }, SQLQueryBindings[]>(query.sql)
          .get(...(query.params as SQLQueryBindings[]))
        if (!matches?.matches && basis === 'initialCandidateId') {
          // Legacy initial proposals can request public photos while their live gallery remains private.
          // Capture the actual current flags without changing or discarding the pending proposal's intent.
          const links = sqlite
            .query<{ imageId: string; visible: number | null }, [string]>(
              'SELECT imageId,COALESCE(localIsPublished,isPublished) visible FROM featureImage WHERE featureId=?',
            )
            .all(featureId)
          for (const link of links) {
            const entry = content.gallery.entries[link.imageId]
            if (
              entry &&
              (link.visible === 0 || link.visible === 1) &&
              entry.isPublished !== Boolean(link.visible)
            ) {
              entry.isPublished = Boolean(link.visible)
              projectionAdjustments.push(`gallery.entries.${link.imageId}.isPublished`)
            }
          }
          const recheck = dialect.sqlToQuery(
            sql`SELECT ${featureContentProjectionMatches(featureId, content)} matches`,
          )
          const exact = sqlite
            .query<{ matches: number }, SQLQueryBindings[]>(recheck.sql)
            .get(...(recheck.params as SQLQueryBindings[]))
          if (!exact?.matches) {
            issues.push({
              featureId,
              reason: 'Initial proposal differs beyond live gallery visibility',
            })
            continue
          }
        } else if (!matches?.matches) {
          issues.push({
            featureId,
            reason: `Current projection does not match ${basis}`,
          })
          continue
        }
      }
      current.push({
        featureId,
        revisionId,
        basis,
        content,
        projectionAdjustments,
        state: {
          isPublished: Boolean(row.isPublished),
          isArchived: Boolean(row.isArchived),
          localIsPublished:
            row.localIsPublished === null ? null : Boolean(row.localIsPublished),
          organisationId: row.organisationId,
          projectId: row.projectId,
          layerId: row.layerId,
        },
      })
    }
    sqlite.exec('ROLLBACK')
    return { current, issues }
  } finally {
    sqlite.close()
  }
}
if (import.meta.main) {
  const [sourcePath, outputPath] = process.argv.slice(2)
  if (!sourcePath || !outputPath)
    throw new Error(
      'Usage: bun scripts/dev/feature-lifecycle/current.ts SOURCE.sqlite PRIVATE-OUTPUT.json',
    )
  const result = await inspectCurrentFeatureConversion(sourcePath)
  writeFileSync(outputPath, JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: 'wx',
  })
  console.log(
    JSON.stringify({
      verified: result.current.length,
      unresolved: result.issues.length,
      initialGalleryVisibilityCaptures: result.current.filter(
        row => row.projectionAdjustments.length,
      ).length,
      bases: result.current.reduce<Record<string, number>>((counts, row) => {
        counts[row.basis] = (counts[row.basis] ?? 0) + 1
        return counts
      }, {}),
    }),
  )
  if (result.issues.length) process.exitCode = 1
}
