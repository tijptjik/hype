// NODE
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { feature } from '../../src/lib/db/schema/feature'
import { featureLocation } from '../../src/lib/db/schema/location'
import { readFeatureLocationBaseline } from '../../src/lib/db/services/locationBaseline'
import { applyUnresolvedFeatureSplit } from '../../src/lib/db/services/locationSplit'
import { planUnresolvedFeatureSplit } from '../../src/lib/locations/migrationPlan'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { backupMirror } from '../breadline/lib/backup'

/**
 * Preserve existing Feature facts in first-class Locations during a fresh local rebuild.
 * @param path Prepared local database, never a remote target.
 * @param directory Private manifests and independent preservation verification.
 * @param existing Connection instrumented by the deployment planner to retain each atomic batch.
 * @returns Planned and explicitly excluded counts after successful application and replay.
 */
export async function convertExistingLocations(
  path: string,
  directory: string,
  existing?: ReturnType<typeof openSqliteDomain>,
): Promise<Record<string, number>> {
  const before = backupMirror(path)
  const connection = existing ?? openSqliteDomain(path)
  const manifestPath = resolve(directory, 'location-split.json')
  const counts: Record<string, number> = { planned: 0 }
  try {
    const rows = await connection.db
      .select({ id: feature.id, projectId: feature.projectId })
      .from(feature)
      .orderBy(feature.id)
    const linked = new Set(
      (
        await connection.db
          .select({ id: featureLocation.featureId })
          .from(featureLocation)
      ).map(row => row.id),
    )
    const plans = [],
      exclusions = []
    for (const row of rows) {
      if (linked.has(row.id)) {
        exclusions.push({ featureId: row.id, reason: 'already-linked' })
        continue
      }
      const baseline = await readFeatureLocationBaseline(
        connection.db,
        row.id,
        row.projectId,
      )
      const proposal =
        baseline.status === 'ready'
          ? planUnresolvedFeatureSplit(baseline.baseline)
          : baseline
      if (proposal.status === 'planned') plans.push(proposal.plan)
      else exclusions.push({ featureId: row.id, reason: proposal.reason })
    }
    counts.planned = plans.length
    for (const row of exclusions) counts[row.reason] = (counts[row.reason] ?? 0) + 1
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          version: 1,
          strategy: 'unresolved-with-preserved-values',
          total: rows.length,
          counts,
          plans,
          exclusions,
        },
        null,
        2,
      ),
    )
    if (
      exclusions.some(
        row =>
          !['already-linked', 'draft', 'intangible', 'non-point'].includes(row.reason),
      )
    )
      throw new Error('Location split needs review; inspect location-split.json')
    for (const replay of [false, true]) {
      for (const plan of plans) {
        const result = await applyUnresolvedFeatureSplit(
          connection.db,
          plan,
          'migration:existing-feature-split',
        )
        if (result.status !== (replay ? 'already-applied' : 'applied'))
          throw new Error('Location split application/replay conflict')
      }
    }
  } finally {
    if (!existing) connection.close()
  }
  const child = Bun.spawn(
    ['bun', 'scripts/locations/verify-feature-split.ts', manifestPath, before, path],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  writeFileSync(
    resolve(directory, 'location-split-verification.log'),
    stdout + '\n' + stderr,
  )
  if (code !== 0) throw new Error('Location split preservation check failed')
  return counts
}
