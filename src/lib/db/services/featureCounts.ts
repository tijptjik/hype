// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DB
import { feature } from '#lib/db/schema/feature.js'
import { divisionDefinition } from '#lib/db/schema/division.js'
import { featureDivisionMembership } from '#lib/db/schema/featureDivision.js'
import {
  featureCountCache,
  featureCountRevision,
  featureCountRollup,
  featureCountUserRevision,
} from '#lib/db/schema/featureCount.js'
import { isSqliteBusyError, retryBusyRead } from './sqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  DivisionFacet,
  FeatureQueryInput,
} from '#lib/api/services/featureQuery.types.js'
// TYPES

/** Exact count metadata, stored together for an authorized feature-query fingerprint. */
type FeatureQueryCounts = {
  totalCount: number
  facets: { divisions: Record<string, DivisionFacet> }
}

/** The aggregate output shared by direct count queries and maintained rollup sums. */
type FeatureCountGroup = DivisionFacet

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
 * @param groups - Independent selected division counts with localized registry names.
 * @param totalCount - Feature total, counted independently of ancestor memberships.
 * @returns Exact total and ID-keyed division facets.
 */
function toFeatureQueryCounts(
  groups: FeatureCountGroup[],
  totalCount: number,
): FeatureQueryCounts {
  return {
    totalCount,
    facets: {
      divisions: Object.fromEntries(groups.map(group => [group.id, group])),
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
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 4, ...statement }))
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
  // Aggregate only IDs before joining large polygon attributes; SQLite otherwise
  // carries a copy of those attributes per membership through its grouping sorter.
  const memberships = db
    .select({
      divisionId: featureDivisionMembership.divisionId,
      count: sql<number>`count(distinct ${feature.id})`.as('count'),
    })
    .from(source)
    .innerJoin(
      featureDivisionMembership,
      and(
        eq(featureDivisionMembership.featureId, feature.id),
        eq(featureDivisionMembership.selected, true),
      ),
    )
    .where(and(...conditions))
    .groupBy(featureDivisionMembership.divisionId)
    .as('memberships')
  // Group by stable identity; localized names are a scalar lookup, never a counting join.
  const aggregate = db
    .select({
      id: divisionDefinition.id,
      divisionCode: sql<
        string | null
      >`json_extract(${divisionDefinition.attributes}, '$.divisionCode')`,
      hasGeometry:
        sql<number>`coalesce(json_array_length(json_extract(${divisionDefinition.attributes}, '$.membershipGeometry')), 0) > 0`.mapWith(
          Boolean,
        ),
      level: sql<
        number | null
      >`json_extract(${divisionDefinition.attributes}, '$.level')`,
      category: sql<
        string | null
      >`json_extract(${divisionDefinition.attributes}, '$.category')`,
      class: sql<
        string | null
      >`json_extract(${divisionDefinition.attributes}, '$.class')`,
      i18n: sql<DivisionFacet['i18n']>`(select coalesce(json_group_object(
        case locale when 'zh-hant' then 'zhHant' when 'zh-hans' then 'zhHans' else locale end,
        json_object('name', name)), '{}') from divisionI18n
        where divisionId = ${divisionDefinition.id} and name is not null and name != '')`.mapWith(
        value => JSON.parse(String(value)),
      ),
      count: memberships.count,
    })
    .from(memberships)
    .innerJoin(divisionDefinition, eq(divisionDefinition.id, memberships.divisionId))
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

  // Read totals after the revision snapshot. Ancestor counts must never be summed.
  const totals = rollupConditions
    ? await retryBusyRead(() =>
        db
          .select({ count: sql<number>`coalesce(sum("feature"."totalCount"), 0)` })
          .from(sql`${featureCountRollup} as "feature"`)
          .where(and(...rollupConditions)),
      )
    : await retryBusyRead(() =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(source)
          .where(and(...conditions)),
      )
  const counts = toFeatureQueryCounts(
    await retryBusyRead(() => aggregate),
    Number(totals[0]?.count ?? 0),
  )
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
