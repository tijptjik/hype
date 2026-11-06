// DRIZZLE
import { sql } from 'drizzle-orm'
// REVISIONS
import { matchesChangelogFilters } from '#lib/revisions/changelogFilters.js'
import { diffRevisionValues } from '#lib/revisions/diff.js'
// SERVICES
import {
  readFeaturePublicationChanges,
  readFeaturePrivateChanges,
} from './featureRevisionHistory'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type {
  ChangelogCursor,
  ChangelogEntry,
  ChangelogResource,
  ChangelogFilters,
  ChangelogFilterOptions,
} from '#lib/revisions/changelog.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Scope and feed contracts
// 2. Bounded hierarchy reader
// ---

export type ChangelogScope = {
  resource: ChangelogResource
  id: string
  organisationId: string
  projectId?: string
  hubId: string | null
}
export type ChangelogCandidate = {
  key: string
  resourceType: ChangelogEntry['resourceType']
  resourceId: string
  ownerType: ChangelogResource | 'feature'
  ownerId: string
  category: ChangelogEntry['category']
  createdAt: string
  changeSetId: string
  organisationId: string
  projectId: string | null
  layerId: string | null
  hubId: string | null
  generation: number
  revisionId: string
  name: string
  content: string | null
  previous: string | null
  actorId: string
  baselineActorId: string | null
  baselineActorRole: 'reviewer' | 'contributor' | null
  displayActorId: string
  displayActorOrigin: string
  actorName: string | null
  actorUsername: string | null
  actorDisplayUsername: string | null
  origin: string
  reason: string | null
  isArchived: number
}

export type ChangelogSubject = Pick<
  ChangelogCandidate,
  | 'ownerType'
  | 'ownerId'
  | 'category'
  | 'organisationId'
  | 'projectId'
  | 'layerId'
  | 'hubId'
  | 'isArchived'
>

/** Recheck current persisted ancestry before reading or writing a private checkpoint.
 * @param scope Ancestry authorized by the remote handler.
 * @returns Scope fence over the canonical root identity.
 * @remarks Callers authorize the root first. This guard repeats persisted ancestry
 * at the checkpoint boundary to reject a subsequent resource move.
 */
export function buildChangelogRootGuard(scope: ChangelogScope): SQL {
  if (scope.resource === 'organisation')
    return sql`EXISTS(SELECT 1 FROM organisation o WHERE o.id=${scope.id} AND o.id=${scope.organisationId} AND o.hubId IS ${scope.hubId})`
  if (scope.resource === 'project')
    return sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId
    WHERE p.id=${scope.id} AND p.organisationId=${scope.organisationId} AND o.hubId IS ${scope.hubId})`
  return sql`EXISTS(SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId AND p.organisationId=l.organisationId JOIN organisation o ON o.id=p.organisationId
    WHERE l.id=${scope.id} AND l.projectId=${scope.projectId} AND l.organisationId=${scope.organisationId} AND o.hubId IS ${scope.hubId})`
}

/**
 * Fences the selected root and every denormalized descendant against persisted ancestry.
 * @param scope Server-authorized root ancestry.
 * @returns Predicates over the feed's canonical o/p/l/f aliases.
 * @remarks A descendant moved after authorization disappears from the feed.
 */
function scopeGuard(scope: ChangelogScope): SQL {
  return sql`o.id=${scope.organisationId} AND o.hubId IS ${scope.hubId}
    ${scope.resource === 'organisation' ? sql`` : sql`AND p.id=${scope.projectId}`}
    ${scope.resource === 'layer' ? sql`AND l.id=${scope.id}` : sql``}`
}

/**
 * Reads accepted resource changes across a current hierarchy with stable keyset paging.
 * @param db Request database.
 * @param input Authorized root, locale fallback order, filters, cursor and per-record authorization.
 * @returns At most 25 attributed entries, the next raw-page cursor and optional authorized filter metadata.
 * @remarks Drafts, proposals and tasks are excluded. Feature differences reuse the current
 * privacy-aware readers; unauthorized descendants are omitted before response projection.
 */
export async function listResourceChangelog(
  db: Database,
  input: {
    scope: ChangelogScope
    locales: readonly string[]
    before?: ChangelogCursor
    filters?: ChangelogFilters
    includeFilterOptions?: boolean
    authorize: (candidate: ChangelogSubject) => boolean
    internalIds: ReadonlySet<string>
    allowedInternalIds: ReadonlySet<string>
  },
): Promise<{
  entries: ChangelogEntry[]
  nextCursor: ChangelogCursor | null
  unavailable: string[]
  filterOptions?: ChangelogFilterOptions
}> {
  const storage = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table'`,
  )
  const tables = new Set(storage.map(row => row.name))
  const unavailable: string[] = []
  const branches: SQL[] = []
  const guard = scopeGuard(input.scope)
  /** Build a localized live name with deterministic fallback, including archived records.
   * @param resource Feed resource type.
   * @returns Name expression using the resource alias x.
   */
  function nameFor(resource: ChangelogCandidate['ownerType']): SQL {
    const table = sql.identifier(`${resource}I18n`)
    const owner = sql.identifier(`${resource}Id`)
    const name = sql.identifier(resource === 'feature' ? 'title' : 'name')
    const order = sql.join(
      input.locales.map(
        (locale, index) =>
          sql`WHEN ${locale.toLowerCase().replaceAll('-', '')} THEN ${index}`,
      ),
      sql` `,
    )
    return sql`COALESCE((SELECT t.${name} FROM ${table} t WHERE t.${owner}=x.id AND trim(t.${name})<>''
      ORDER BY CASE lower(replace(t.locale,'-','')) ${order} ELSE 99 END,t.locale LIMIT 1),x.id)`
  }
  /** Scope each branch through agreeing parent links, never an in-memory ID list.
   * @param resource Resource represented by x.
   * @returns Current ancestry joins.
   */
  function ancestry(resource: ChangelogCandidate['ownerType']): SQL {
    if (resource === 'organisation')
      return sql`organisation x JOIN organisation o ON o.id=x.id`
    if (resource === 'project')
      return sql`project x JOIN project p ON p.id=x.id JOIN organisation o ON o.id=p.organisationId`
    if (resource === 'layer')
      return sql`layer x JOIN layer l ON l.id=x.id JOIN project p ON p.id=l.projectId AND p.organisationId=l.organisationId JOIN organisation o ON o.id=p.organisationId`
    return sql`feature x JOIN layer l ON l.id=x.layerId AND l.projectId=x.projectId AND l.organisationId=x.organisationId
      JOIN project p ON p.id=l.projectId AND p.organisationId=l.organisationId JOIN organisation o ON o.id=p.organisationId`
  }
  /** Add an immutable source when its read-side storage is installed.
   * @param resource Resource ancestry owner.
   * @param category Immutable journal source.
   * @returns Nothing; appends one bounded-feed branch.
   */
  function add(
    resource: ChangelogCandidate['ownerType'],
    category: ChangelogEntry['category'],
  ): void {
    const source =
      category === 'fields'
        ? 'propertyCatalogRevision'
        : category === 'publication'
          ? 'featureRevisionPublication'
          : category === 'maintenance'
            ? 'featurePrivateCapture'
            : `${resource}Revision`
    if (
      !tables.has(source) ||
      !tables.has('revisionChangeSet') ||
      (resource === 'feature' && !tables.has('featureRevision'))
    ) {
      unavailable.push(`${resource} ${category}`)
      return
    }
    const isFeature = resource === 'feature'
    const hasLegacyActor =
      isFeature &&
      category === 'publication' &&
      tables.has('featureBaselineAttribution')
    const legacyActor = hasLegacyActor
      ? sql`COALESCE(legacy.reviewerId,legacy.contributorId)`
      : sql`NULL`
    const legacyJoin = hasLegacyActor
      ? sql`LEFT JOIN featureBaselineAttribution legacy ON legacy.publicationId=r.id AND legacy.featureId=x.id AND r.generation=0 AND c.origin='migration'`
      : sql``
    const revision = sql.identifier(source)
    const owner = sql.identifier(`${resource}Id`)
    const content = isFeature
      ? sql`NULL`
      : category === 'fields'
        ? sql`json_extract(r.content,'$.' || json_quote(field.key))`
        : sql`r.content`
    const previous = isFeature
      ? sql`NULL`
      : category === 'fields'
        ? sql`json_extract(b.content,'$.' || json_quote(field.key))`
        : sql`b.content`
    const revisionId = category === 'maintenance' ? sql`r.revisionId` : sql`r.id`
    const key = sql`${`${resource}:${category}:`} || ${revisionId} ${category === 'fields' ? sql`|| ':' || field.key` : sql``}`
    const rJoin =
      category === 'fields'
        ? sql`r.resourceId=x.id AND r.scope=${resource}`
        : sql`r.${owner}=x.id`
    const predecessor = isFeature
      ? sql``
      : sql`LEFT JOIN ${revision} b ON b.id=r.previousRevisionId AND ${
          category === 'fields'
            ? sql`b.resourceId=r.resourceId AND b.scope=r.scope`
            : sql`b.${owner}=r.${owner}`
        }`
    const changeSet =
      category === 'maintenance' ? sql`a.changeSetId` : sql`r.changeSetId`
    const order = sql.join(
      input.locales.map(
        (locale, index) =>
          sql`WHEN ${locale.toLowerCase().replaceAll('-', '')} THEN ${index}`,
      ),
      sql` `,
    )
    const fieldName = sql`COALESCE((SELECT json_extract(t.value,'$.label') FROM json_each(COALESCE(${content},${previous}),'$.i18n') t
      WHERE trim(json_extract(t.value,'$.label'))<>'' ORDER BY CASE lower(replace(t.key,'-','')) ${order} ELSE 99 END,t.key LIMIT 1),
      json_extract(COALESCE(${content},${previous}),'$.record.key'),field.key)`
    branches.push(sql`SELECT ${key} AS key,${category === 'fields' ? 'property' : resource} AS resourceType,
      ${category === 'fields' ? sql`field.key` : sql`x.id`} AS resourceId,${resource} AS ownerType,x.id AS ownerId,${category} AS category,
      c.createdAt,c.id AS changeSetId,o.id AS organisationId,${resource === 'organisation' ? sql`NULL` : sql`p.id`} AS projectId,
      ${resource === 'organisation' || resource === 'project' ? sql`NULL` : sql`l.id`} AS layerId,o.hubId,
      ${isFeature ? sql`r.generation` : sql`0`} AS generation,${revisionId} AS revisionId,${category === 'fields' ? fieldName : nameFor(resource)} AS name,
      ${content} AS content,${previous} AS previous,x.isArchived,c.actorId,
      ${legacyActor} AS baselineActorId,
      ${hasLegacyActor ? sql`CASE WHEN legacy.reviewerId IS NOT NULL THEN 'reviewer' WHEN legacy.contributorId IS NOT NULL THEN 'contributor' END` : sql`NULL`} AS baselineActorRole,
      COALESCE(${legacyActor},c.actorId) AS displayActorId,
      CASE WHEN ${legacyActor} IS NOT NULL THEN 'user' ELSE c.origin END AS displayActorOrigin,
      COALESCE(actor.name,actor.displayUsername,actor.username) AS actorName,
      NULLIF(actor.username,'') AS actorUsername,NULLIF(actor.displayUsername,'') AS actorDisplayUsername,c.origin,c.reason
      FROM ${ancestry(resource)} JOIN ${revision} r ON ${rJoin}
      ${category === 'maintenance' ? sql`JOIN featureRevision a ON a.id=r.revisionId AND a.featureId=r.featureId` : sql``}
      JOIN revisionChangeSet c ON c.id=${changeSet}
      ${legacyJoin}
      LEFT JOIN user actor ON actor.id=COALESCE(${legacyActor},c.actorId) AND (c.origin='user' OR ${legacyActor} IS NOT NULL) ${predecessor}
      ${category === 'fields' ? sql`JOIN json_each(json_patch(COALESCE(b.content,'{}'),r.content)) field` : sql``}
      WHERE ${guard} ${category === 'fields' ? sql`AND ${content} IS NOT ${previous}` : sql``}`)
  }
  // Only sources at or below the authorized root participate; tasks never enter the union.
  if (input.scope.resource === 'organisation') {
    add('organisation', 'profile')
    add('organisation', 'fields')
  }
  if (input.scope.resource !== 'layer') {
    add('project', 'profile')
    add('project', 'fields')
  }
  add('layer', 'profile')
  add('feature', 'publication')
  add('feature', 'maintenance')
  if (!branches.length) return { entries: [], nextCursor: null, unavailable }
  const filters = input.filters ?? {}
  const cursor = input.before
  // D1 restricts compound SELECT terms. Merge bounded source pages instead of one large union.
  const groups: SQL[][] = []
  for (let index = 0; index < branches.length; index += 3)
    groups.push(branches.slice(index, index + 3))
  let filterOptions: ChangelogFilterOptions | undefined
  // Aggregate only attribution and time per authorized owner; never hydrate historical values for facets.
  if (input.includeFilterOptions && !cursor) {
    filterOptions = { actors: [], period: null }
    type FacetRow = ChangelogSubject &
      Pick<
        ChangelogCandidate,
        'actorId' | 'origin' | 'actorName' | 'actorUsername' | 'actorDisplayUsername'
      > & { firstAt: string; lastAt: string }
    const facets = await Promise.allSettled(
      groups.map(group =>
        db.all<FacetRow>(sql`
      SELECT ownerType,ownerId,category,organisationId,projectId,layerId,hubId,isArchived,
        displayActorId AS actorId,displayActorOrigin AS origin,actorName,actorUsername,actorDisplayUsername,MIN(createdAt) AS firstAt,MAX(createdAt) AS lastAt
      FROM (${sql.join(group, sql` UNION ALL `)})
      GROUP BY ownerType,ownerId,category,organisationId,projectId,layerId,hubId,isArchived,
        displayActorId,displayActorOrigin,actorName,actorUsername,actorDisplayUsername`),
      ),
    )
    const actors = new Map<string, ChangelogFilterOptions['actors'][number]>()
    for (const page of facets) {
      if (page.status === 'rejected') throw page.reason
      for (const row of page.value) {
        if (!input.authorize(row)) continue
        const key = JSON.stringify([row.origin, row.actorId])
        const sourceLabels: Record<string, string> = {
          system: 'System',
          migration: 'Author unknown',
          import: 'Import',
          restore: 'Restore',
        }
        const label =
          row.origin === 'user'
            ? row.actorUsername
              ? `@${row.actorDisplayUsername || row.actorUsername}`
              : row.actorName || row.actorId
            : `${sourceLabels[row.origin] ?? row.origin} · ${row.actorId}`
        actors.set(key, { id: row.actorId, origin: row.origin, label })
        const period = filterOptions.period
        filterOptions.period = {
          from: !period || row.firstAt < period.from ? row.firstAt : period.from,
          to: !period || row.lastAt > period.to ? row.lastAt : period.to,
        }
      }
    }
    filterOptions.actors = [...actors.values()].sort(
      (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
    )
  }
  const predicates: SQL[] = []
  if (cursor)
    predicates.push(
      sql`(createdAt<${cursor.createdAt} OR (createdAt=${cursor.createdAt} AND key<${cursor.key}))`,
    )
  if (filters.resourceType) predicates.push(sql`resourceType=${filters.resourceType}`)
  if (filters.category) predicates.push(sql`category=${filters.category}`)
  if (filters.origin) predicates.push(sql`origin=${filters.origin}`)
  if (filters.actor)
    predicates.push(
      sql`displayActorId=${filters.actor.id} AND displayActorOrigin=${filters.actor.origin}`,
    )
  if (filters.from) predicates.push(sql`createdAt>=${`${filters.from}T00:00:00.000Z`}`)
  if (filters.to)
    predicates.push(
      sql`createdAt<${new Date(Date.parse(filters.to) + 86_400_000).toISOString()}`,
    )
  // Literal metadata search uses instr, so percent and underscore are ordinary characters.
  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase()
    predicates.push(sql`(instr(lower(name),${search})>0 OR instr(lower(resourceId),${search})>0
      OR instr(lower(displayActorId),${search})>0 OR instr(lower(actorId),${search})>0 OR instr(lower(COALESCE(actorName,'')),${search})>0
      OR instr(lower(COALESCE(actorUsername,'')),${search})>0 OR instr(lower(COALESCE(actorDisplayUsername,'')),${search})>0
      OR instr(lower(COALESCE(reason,'')),${search})>0)`)
  }
  const pages = await Promise.allSettled(
    groups.map(group =>
      db.all<ChangelogCandidate>(sql`SELECT * FROM (${sql.join(group, sql` UNION ALL `)})
    ${predicates.length ? sql`WHERE ${sql.join(predicates, sql` AND `)}` : sql``}
    ORDER BY createdAt DESC,key DESC LIMIT 26`),
    ),
  )
  const candidates: ChangelogCandidate[] = []
  for (const page of pages) {
    if (page.status === 'rejected') throw page.reason
    candidates.push(...page.value)
  }
  const rows = candidates
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.key === b.key
          ? 0
          : a.key < b.key
            ? 1
            : -1
        : a.createdAt < b.createdAt
          ? 1
          : -1,
    )
    .slice(0, 26)
  const entries: ChangelogEntry[] = []
  for (const row of rows.slice(0, 25)) {
    if (!input.authorize(row)) continue
    let changes: ChangelogEntry['changes'] = []
    let initial = row.previous === null,
      baseline = initial && row.origin === 'migration',
      unpublished = false,
      redacted = false
    if (row.resourceType === 'feature') {
      // Recheck the exact candidate ancestry and reuse historical/current audience protection.
      const featureGuard = sql`EXISTS(SELECT 1 FROM feature x JOIN layer l ON l.id=x.layerId AND l.projectId=x.projectId AND l.organisationId=x.organisationId
        JOIN project p ON p.id=l.projectId AND p.organisationId=l.organisationId JOIN organisation o ON o.id=p.organisationId
        WHERE x.id=${row.resourceId} AND x.layerId=${row.layerId} AND x.projectId=${row.projectId} AND x.organisationId=${row.organisationId} AND ${guard})`
      const common = {
        featureId: row.resourceId,
        guard: featureGuard,
        internalIds: input.internalIds,
        allowedInternalIds: input.allowedInternalIds,
      }
      const result =
        row.category === 'publication'
          ? await readFeaturePublicationChanges(db, {
              ...common,
              generation: row.generation,
            })
          : await readFeaturePrivateChanges(db, {
              ...common,
              revisionId: row.revisionId,
            })
      if (!result) continue
      changes = result.changes
      redacted = result.redacted
      baseline = row.category === 'publication' && row.generation === 0
      unpublished = 'unpublished' in result && result.unpublished === true
      initial = 'baseline' in result && result.baseline === true
    } else if (row.category === 'fields') {
      changes = diffRevisionValues(
        row.previous === null
          ? { present: false }
          : { present: true, value: JSON.parse(row.previous) },
        row.content === null
          ? { present: false }
          : { present: true, value: JSON.parse(row.content) },
      ).map(change => ({ ...change, path: [row.resourceId, ...change.path] }))
    } else if (!initial) {
      changes = diffRevisionValues(
        { present: true, value: JSON.parse(row.previous!) },
        { present: true, value: JSON.parse(row.content!) },
      )
    }
    const entry: ChangelogEntry = {
      key: row.key,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      name: row.name,
      category: row.category,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorName: row.baselineActorId ? null : row.actorName,
      actorUsername: row.baselineActorId ? null : row.actorUsername,
      actorDisplayUsername: row.baselineActorId ? null : row.actorDisplayUsername,
      origin: row.origin,
      baselineActor:
        row.baselineActorId && row.baselineActorRole
          ? {
              actorId: row.baselineActorId,
              actorName: row.actorName,
              actorUsername: row.actorUsername,
              actorDisplayUsername: row.actorDisplayUsername,
              role: row.baselineActorRole,
            }
          : null,
      reason: row.reason,
      initial,
      baseline,
      unpublished,
      redacted,
      changes,
    }
    if (!filters.action || matchesChangelogFilters(entry, { action: filters.action }))
      entries.push(entry)
  }
  const last = rows[24]
  return {
    ...(filterOptions ? { filterOptions } : {}),
    entries,
    nextCursor: rows.length > 25 ? { createdAt: last.createdAt, key: last.key } : null,
    unavailable,
  }
}
