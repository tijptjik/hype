// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DB
import { feature } from '$lib/db/schema/feature'
import { featureNeighbourhood } from '$lib/db/schema/featureQuery'
import {
  featureCountCache,
  featureCountRevision,
  featureCountRollup,
  featureCountUserRevision,
} from '$lib/db/schema/featureCount'
import { isSqliteBusyError, retryBusyRead } from './sqlite'
// TYPES
import type { Database } from '$lib/types'
import type { FeatureQueryInput } from '$lib/api/services/featureQuery.types'
// TYPES

/** Exact count metadata, stored together for an authorized feature-query fingerprint. */
type FeatureQueryCounts = {
  totalCount: number
  facets: { neighbourhoods: Record<string, number> }
}

/** The aggregate output shared by direct count queries and maintained rollup sums. */
type FeatureCountGroup = { neighbourhood: string | null; count: number }

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. COUNT METADATA
// - toFeatureQueryCounts
// - fingerprintFeatureCountQuery
// 2. COUNT READS
// - getFeatureQueryCounts
// ---
/********************
 *  1. COUNT METADATA
 ************/
// +++ Count Metadata

/**
 * Converts grouped totals into the shared count envelope.
 * @param groups - Raw English neighbourhood bins, including the unknown bin.
 * @returns Exact total and named neighbourhood facets.
 */
function toFeatureQueryCounts(groups: FeatureCountGroup[]): FeatureQueryCounts {
  return {
    totalCount: groups.reduce((total, group) => total + Number(group.count), 0),
    facets: {
      neighbourhoods: Object.fromEntries(
        groups
          .filter(group => group.neighbourhood !== null && group.neighbourhood !== '')
          .flatMap(group =>
            group.neighbourhood ? [[group.neighbourhood, Number(group.count)]] : [],
          ),
      ),
    },
  }
}

/**
 * Hashes the actual authorized SQL and encoded bindings used by the database.
 * @param statement - Compiled count statement including trusted hub, role and list predicates.
 * @returns A fixed-size cache identity that never trusts the client cache scope.
 * @remarks Pagination, sorting, exclusions and response preferences never enter this SQL.
 */
async function fingerprintFeatureCountQuery(statement: {
  sql: string
  params: unknown[]
}): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, ...statement }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

// ---
/********************
 *  2. COUNT READS
 ************/
// +++ Count Reads

/**
 * Sums maintained bins or reuses a revision-matched aggregate for detailed filters.
 * @param db - Request database.
 * @param input - Validated count filters with server-resolved list ownership.
 * @param conditions - Complete authorized feature predicates without pagination exclusions.
 * @param source - Indexed feature source used only for a cache-miss detailed aggregate.
 * @param rollupConditions - Equivalent predicates for maintained bins, or null for detailed filters.
 * @returns Exact count metadata for the authorized query.
 * @remarks Arbitrary filter combinations are computed once per matching revision, not
 * precomputed combinatorially. List revisions are per target user, so one saved-list
 * edit does not invalidate public counts or another user's saved-query totals.
 */
export async function getFeatureQueryCounts(
  db: Database,
  input: FeatureQueryInput,
  conditions: SQL[],
  source: SQL,
  rollupConditions: SQL[] | null,
): Promise<FeatureQueryCounts> {
  // The rollup has one row per feature, but neighbourhood facets are ancestor memberships.
  // Use it only for the total; the compatibility view supplies exact facet memberships.
  const rollupTotal = rollupConditions
    ? await retryBusyRead(() =>
        db
          .select({ totalCount: sql<number>`coalesce(sum("feature"."totalCount"), 0)` })
          .from(sql`${featureCountRollup} as "feature"`)
          .where(and(...rollupConditions)),
      )
    : null

  const aggregate = db
    .select({
      neighbourhood: featureNeighbourhood.neighbourhood,
      count: sql<number>`count(*)`,
    })
    .from(source)
    .leftJoin(featureNeighbourhood, eq(featureNeighbourhood.featureId, feature.id))
    .where(and(...conditions))
    .groupBy(featureNeighbourhood.neighbourhood)
  const targetUserId = input.filters?.list?.userId
  const userRevision = targetUserId
    ? sql<number>`coalesce((${db.select({ revision: featureCountUserRevision.revision }).from(featureCountUserRevision).where(eq(featureCountUserRevision.userId, targetUserId)).limit(1)}), 0)`
    : sql<number>`0`
  const [key, revisionRows] = await Promise.all([
    fingerprintFeatureCountQuery(aggregate.toSQL()),
    retryBusyRead(() =>
      db
        .select({
          revision: featureCountRevision.revision,
          userRevision: userRevision.as('userRevision'),
        })
        .from(featureCountRevision)
        .where(eq(featureCountRevision.id, 1)),
    ),
  ])
  const snapshot = revisionRows[0]
  if (!snapshot) throw new Error('FEATURE_COUNT_REVISION_MISSING')
  const cached = await retryBusyRead(() =>
    db
      .select({
        totalCount: featureCountCache.totalCount,
        facets: featureCountCache.facets,
      })
      .from(featureCountCache)
      .where(
        and(
          eq(featureCountCache.key, key),
          eq(featureCountCache.revision, snapshot.revision),
          eq(featureCountCache.userRevision, snapshot.userRevision),
        ),
      )
      .limit(1),
  )
  if (cached[0]) return cached[0]

  const counts = toFeatureQueryCounts(await retryBusyRead(() => aggregate))
  if (rollupTotal) counts.totalCount = Number(rollupTotal[0]?.totalCount ?? 0)
  // Publish only under the revisions observed before the aggregate, never a newer revision.
  try {
    await db.run(sql`insert into ${featureCountCache}
    ("key", "revision", "userRevision", "totalCount", "facets", "updatedAt")
    select ${key}, ${snapshot.revision}, ${snapshot.userRevision}, ${counts.totalCount}, ${JSON.stringify(counts.facets)}, ${Date.now()}
    from ${featureCountRevision}
    where ${featureCountRevision.id} = 1 and ${featureCountRevision.revision} = ${snapshot.revision}
      and ${userRevision} = ${snapshot.userRevision}
    on conflict("key") do update set
      "revision" = excluded."revision", "userRevision" = excluded."userRevision",
      "totalCount" = excluded."totalCount", "facets" = excluded."facets", "updatedAt" = excluded."updatedAt"`)
  } catch (error) {
    // Lock contention must not turn a successful read into a failed feature request.
    // Other persistence errors remain visible so schema/contract failures cannot hide.
    if (!isSqliteBusyError(error)) throw error
  }
  return counts
}
// ---
