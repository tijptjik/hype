// NODE
import { join } from 'node:path'
// DRIZZLE
import { sql } from 'drizzle-orm'
// IMPORT
import { buildBreadlineFeaturePlan } from '../features'
import { reviewedDonorCuration } from './donor-curation'
import { compareFeatureSources, type FeatureSource } from './feature-sync'
import { userSyncHash } from './user-sync-contract'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import { locationSyncSchemaHash } from './location-feature-sync-contract'
// DOMAIN
import {
  readCurrentFeatureRevision,
  prepareFeatureEdit,
} from '../../../src/lib/db/services/featureLifecycle'
import { readFeatureRevisionSource } from '../../../src/lib/db/services/featureRevisionSource'
import { buildFeatureRevisionBaselineContent } from '../../../src/lib/db/services/featureRevisionContent'
import { prepareFeatureRevisionInitialization } from '../../../src/lib/db/services/featureRevision'
import { prepareRevisionCheck } from '../../../src/lib/db/services/revisionBatch'
import {
  prepareSharedLocationCorrection,
  sharedLocationFacts,
} from '../../../src/lib/db/services/locationShared'
import { readLocationFacts } from '../../../src/lib/locations/factsSnapshot'
import { resolveFeatureLocation } from '../../../src/lib/locations/resolve'
import { FeatureLocationOverridesSchema } from '../../../src/lib/locations/validation'
// TYPES
import type { LocationFacts } from '../../../src/lib/locations/model'
import type { FeatureRevisionContent } from '../../../src/lib/revisions/featureContent'
import type {
  LocationFeatureSyncState,
  LocationFeatureSyncPlan,
  LocationSyncGroup,
  SyncStatement,
} from './location-feature-sync-contract'

type Domain = ReturnType<typeof openSqliteDomain>
const ACTOR = 'system:breadline-sync'
const PHONE = 'gPropPhNum01'
/** Compare structured values without object-key ordering noise. @param a First value. @param b Second value. @returns Equality. */
const same = (a: unknown, b: unknown): boolean =>
  userSyncHash(a ?? null) === userSyncHash(b ?? null)
/** Compile one Drizzle statement. @param query Prepared domain statement. @returns Portable bound SQL. */
function compile(query: unknown): SyncStatement {
  if (
    !query ||
    typeof query !== 'object' ||
    !('toSQL' in query) ||
    typeof query.toSQL !== 'function'
  )
    throw Error('Sync statement is not a compilable domain query')
  const q = query.toSQL() as { sql: string; params: unknown[] }
  return { sql: q.sql, params: q.params as SyncStatement['params'] }
}
/** Guard source crosswalk and the accepted Feature revision in the write transaction.
 * @param row Source identity. @param featureId Destination. @param hash Accepted source hash. @param revision Accepted revision or null for creation. @returns SQL guard statement.
 */
function crosswalkGuard(
  row: FeatureSource['rows'][number],
  featureId: string,
  hash: string | null,
  revision: string | null,
): SyncStatement {
  return {
    sql: `SELECT CASE WHEN ${revision ? `EXISTS(SELECT 1 FROM breadlineImportFeature b JOIN feature f ON f.id=b.featureId WHERE b.sourceTable=? AND b.sourceId=? AND b.featureId=? AND b.sourceHash=? AND f.currentRevisionId=?)` : `NOT EXISTS(SELECT 1 FROM breadlineImportFeature WHERE sourceTable=? AND sourceId=?) AND NOT EXISTS(SELECT 1 FROM feature WHERE id=?)`} THEN 1 ELSE json('BREADLINE_SYNC_DRIFT') END`,
    params: revision
      ? [row.table, row.id, featureId, hash, revision]
      : [row.table, row.id, featureId],
  }
}
/** Execute planned writes on the disposable projection only. @param d Domain. @param statements Atomic queries. @returns Nothing. */
async function execute(d: Domain, statements: SyncStatement[]): Promise<void> {
  await d.binding.batch(statements.map(s => d.binding.prepare(s.sql).bind(...s.params)))
}

/** Reconcile an importer-owned value, retaining independent edits or exposing a conflict.
 * @param old Last imported value. @param incoming New source value. @param current Accepted value. @param field Diagnostic field. @param conflicts Conflict list. @returns Accepted or updated value.
 */
export function mergeLocationSyncValue<T>(
  old: T,
  incoming: T,
  current: T,
  field: string,
  conflicts: string[],
): T {
  if (same(old, incoming) || same(current, incoming)) return current
  if (!same(current, old)) {
    conflicts.push(field)
    return current
  }
  return incoming
}

/** Prepare source projections using the existing validated importer without executing its SQL.
 * @param d Current target context. @param sourcePath Complete source mirror. @param directory Private scratch directory. @returns Normalized importer facts keyed by stable identity.
 */
export function projectLocationSyncFacts(
  d: Domain,
  sourcePath: string,
  directory: string,
): Record<string, LocationFacts> {
  const facts: Record<string, LocationFacts> = {}
  buildBreadlineFeaturePlan(
    [
      '--source',
      sourcePath,
      '--target',
      d.sqlite.filename,
      '--output',
      join(directory, 'projection.sql'),
    ],
    {
      target: d.sqlite,
      token: crypto.randomUUID(),
      projectExisting: true,
      onFacts: (key, value) => {
        facts[key] = value
      },
    },
  )
  return facts
}

/** Explicitly adopt a verified post-cutover baseline without treating curation as upstream data.
 * @param d Current private production snapshot. @param source Fresh complete source. @param legacy Previously accepted source/state. @param projections Normalized unchanged source. @param targetIdentity Reviewed database identity. @returns Current-schema state; never writes the database.
 * @remarks Every original source hash and Feature identity must still match; changed source requires reconciliation before adoption.
 */
export function adoptLocationSyncBaseline(
  d: Domain,
  source: FeatureSource,
  legacy: {
    targetIdentity: string
    source: FeatureSource
    planHash: string
    projections: Record<string, { feature: { id: unknown }[] }>
  },
  projections: Record<string, LocationFacts>,
  targetIdentity: string,
): LocationFeatureSyncState {
  if (
    legacy.targetIdentity !== targetIdentity ||
    compareFeatureSources(legacy.source, source).length
  )
    throw Error('Baseline adoption requires unchanged accepted source and target')
  const featureIds: Record<string, string> = {}
  for (const row of source.rows.filter(r => r.eligible)) {
    const mapped = d.sqlite
      .query(
        `SELECT b.featureId,b.sourceHash,f.currentRevisionId,r.id FROM breadlineImportFeature b JOIN feature f ON f.id=b.featureId JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id WHERE b.sourceTable=? AND b.sourceId=?`,
      )
      .get(row.table, row.id) as { featureId: string; sourceHash: string } | null
    if (
      !mapped ||
      mapped.featureId !==
        legacy.projections[`${row.table}:${row.id}`]?.feature[0]?.id ||
      mapped.sourceHash !== row.hash ||
      !projections[`${row.table}:${row.id}`]
    )
      throw Error('Baseline adoption identity or revision differs')
    featureIds[`${row.table}:${row.id}`] = mapped.featureId
  }
  const count = d.sqlite
    .query('SELECT count(*) AS n FROM breadlineImportFeature')
    .get() as { n: number }
  if (count.n !== source.rows.filter(r => r.eligible).length)
    throw Error('Baseline contains unexpected source mappings')
  return {
    version: 2,
    targetIdentity,
    source,
    featureIds,
    projections,
    planHash: legacy.planHash,
  }
}

/** Derive a safe Feature update without changing its reviewed Location identity or placement evidence.
 * @param content Current accepted aggregate. @param before Last normalized source. @param incoming New normalized source. @param row New source row. @param prior Previous source row. @returns Derived content and conflicts.
 */
export function deriveLocationSyncContent(
  content: FeatureRevisionContent,
  before: LocationFacts,
  incoming: LocationFacts,
  row: FeatureSource['rows'][number],
  prior: FeatureSource['rows'][number],
): { content: FeatureRevisionContent; conflicts: string[] } {
  const next = structuredClone(content),
    conflicts: string[] = []
  for (const [locale, name] of Object.entries(incoming.names)) {
    const translation = next.translations[locale]
    if (!translation) {
      if (!same(before.names[locale], name)) conflicts.push(`names.${locale}`)
      continue
    }
    translation.title.value = mergeLocationSyncValue(
      before.names[locale] ?? '',
      name,
      translation.title.value,
      `names.${locale}`,
      conflicts,
    )
  }
  // A reviewed placement is never moved automatically by changed source coordinates or addresses.
  if (!same(before.location, incoming.location))
    conflicts.push('location_requires_review')
  if (!same(before.brands, incoming.brands))
    conflicts.push('brand_identity_requires_review')
  if (row.table === 'donors') {
    const phone = next.properties[PHONE]
    const current = phone?.selection.value
      ? (JSON.parse(phone.selection.value) as string[])
      : []
    // Blank source numbers never erase a known contact; durable operator rules supersede source phones.
    if (incoming.phoneNumber?.length) {
      const merged = mergeLocationSyncValue(
        before.phoneNumber ?? [],
        incoming.phoneNumber,
        current,
        'phoneNumber',
        conflicts,
      )
      if (phone) phone.selection.value = JSON.stringify(merged)
      else if (merged.length) conflicts.push('phone_definition_missing')
    }
    next.profile.visitability.isVisitable = mergeLocationSyncValue(
      Boolean(prior.source.active),
      Boolean(row.source.active),
      next.profile.visitability.isVisitable,
      'active',
      conflicts,
    )
  }
  next.placement.addressMeta = {
    ...next.placement.addressMeta,
    breadlineSource: {
      table: row.table,
      id: row.id,
      hash: row.hash,
      source: row.source,
    },
    ...(reviewedDonorCuration(row.table, row.id)
      ? { breadlineCuration: reviewedDonorCuration(row.table, row.id) }
      : {}),
  } as FeatureRevisionContent['placement']['addressMeta']
  return { content: next, conflicts }
}

/** Generate and rehearse a current-schema incremental plan on a disposable target copy.
 * @param workingPath Private writable copy, never live DEV. @param sourcePath Complete fresh mirror. @param state Explicitly adopted current baseline. @param directory Private output directory. @returns Attributed per-Feature SQL, source checkpoint and review exceptions.
 * @remarks No remote writes; missing/excluded identities are review exceptions, and accepted matches, templates, branding and history remain independent.
 */
export async function planLocationFeatureSync(
  workingPath: string,
  sourcePath: string,
  state: LocationFeatureSyncState,
  directory: string,
): Promise<LocationFeatureSyncPlan> {
  const d = openSqliteDomain(workingPath)
  try {
    const { Database } = await import('bun:sqlite')
    const src = new Database(sourcePath, { readonly: true })
    const { readFeatureSyncSource } = await import('./feature-sync')
    let source: FeatureSource
    try {
      source = readFeatureSyncSource(src)
    } finally {
      src.close()
    }
    if (state.version !== 2)
      throw Error('Explicit current-schema baseline adoption required')
    const schemaHash = locationSyncSchemaHash(
      d.sqlite
        .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
        .all() as Record<string, unknown>[],
    )
    const projections = projectLocationSyncFacts(d, sourcePath, directory)
    const changes = compareFeatureSources(state.source, source)
    const changed = new Map(changes.map(c => [`${c.table}:${c.id}`, c]))
    const plan: LocationFeatureSyncPlan = {
      version: 2,
      targetIdentity: state.targetIdentity,
      previousPlanHash: state.planHash,
      source,
      featureIds: { ...state.featureIds },
      projections: { ...state.projections },
      schemaHash,
      groups: [],
      exceptions: [],
      counts: { created: 0, updated: 0, unchanged: 0, excluded: 0 },
    }
    for (const c of changes)
      if (!c.after && c.before?.eligible)
        plan.exceptions.push({
          identity: `${c.table}:${c.id}`,
          reason: 'source_missing_no_automatic_deletion',
        })
    for (const row of source.rows) {
      const identity = `${row.table}:${row.id}`,
        change = changed.get(identity)
      const mapping = d.sqlite
        .query(
          'SELECT featureId,sourceHash FROM breadlineImportFeature WHERE sourceTable=? AND sourceId=?',
        )
        .get(row.table, row.id) as { featureId: string; sourceHash: string } | null
      if (mapping && mapping.featureId !== state.featureIds[identity]) {
        plan.exceptions.push({ identity, reason: 'accepted_feature_identity_changed' })
        continue
      }
      if (!row.eligible) {
        plan.counts.excluded++
        if (mapping)
          plan.exceptions.push({ identity, reason: 'imported_feature_now_excluded' })
        continue
      }
      if (!change) {
        if (
          !mapping ||
          mapping.sourceHash !== row.hash ||
          !(await readCurrentFeatureRevision(d.db, {
            featureId: mapping.featureId,
            guard: sql`1`,
          }))
        )
          plan.exceptions.push({
            identity,
            reason: 'accepted_mapping_missing_or_changed',
          })
        else plan.counts.unchanged++
        continue
      }
      d.sqlite.exec('BEGIN IMMEDIATE')
      try {
        let group: LocationSyncGroup
        if (!mapping) {
          if (change.before?.eligible) throw Error('accepted_mapping_missing')
          group = await prepareCreation(d, sourcePath, directory, row)
        } else {
          if (!change.before || !state.projections[identity])
            throw Error('existing_mapping_without_accepted_baseline')
          if (mapping.sourceHash !== change.before.hash)
            throw Error('accepted_source_hash_changed')
          group = await prepareUpdate(
            d,
            row,
            change.before,
            state.projections[identity],
            projections[identity],
            mapping,
          )
        }
        d.sqlite.exec('COMMIT')
        plan.groups.push(group)
        plan.featureIds[identity] = group.featureId
        plan.projections[identity] = projections[identity]
        mapping ? plan.counts.updated++ : plan.counts.created++
      } catch (error) {
        d.sqlite.exec('ROLLBACK')
        plan.exceptions.push({ identity, reason: String(error) })
      }
    }
    if (d.sqlite.query('PRAGMA foreign_key_check').all().length)
      throw Error('Plan introduced foreign-key violations')
    return plan
  } finally {
    d.close()
  }
}

/** Create a newly eligible identity through the attributed importer and lifecycle initializer.
 * @param d Disposable domain. @param sourcePath Source mirror. @param directory Private scratch. @param row New source identity. @returns Atomic creation group.
 */
async function prepareCreation(
  d: Domain,
  sourcePath: string,
  directory: string,
  row: FeatureSource['rows'][number],
): Promise<LocationSyncGroup> {
  const identity = `${row.table}:${row.id}`
  const creation = buildBreadlineFeaturePlan(
    [
      '--source',
      sourcePath,
      '--target',
      d.sqlite.filename,
      '--output',
      join(directory, 'creation.sql'),
    ],
    { target: d.sqlite, token: crypto.randomUUID(), identities: new Set([identity]) },
  )
  if (creation.createdIds.length !== 1) throw Error('Expected one new identity')
  const featureId = creation.createdIds[0],
    statements = [
      crosswalkGuard(row, featureId, null, null),
      ...creation.statements.map(sql => ({ sql, params: [] })),
    ]
  await execute(d, statements)
  const captured = await readFeatureRevisionSource(d.db, featureId, sql`1`)
  if (!captured) throw Error('New source missing')
  const content = buildFeatureRevisionBaselineContent(captured.snapshot, {
    revisions: {},
    order: [],
  })
  const published = (
    d.sqlite.query('SELECT isPublished FROM feature WHERE id=?').get(featureId) as {
      isPublished: number
    }
  ).isPublished
  const prepared = await prepareFeatureRevisionInitialization(d.db, {
    featureId,
    content,
    published: Boolean(published),
    guard: captured.unchanged,
    actorId: ACTOR,
    origin: 'import',
    reason: 'New Breadline source identity',
  })
  const queries = [
    prepareRevisionCheck(d.db, prepared.guard),
    ...prepared.statements,
  ].map(q => compile(q))
  await execute(d, queries)
  statements.push(...queries)
  const head = d.sqlite
    .query('SELECT currentRevisionId FROM feature WHERE id=?')
    .get(featureId) as { currentRevisionId: string }
  return {
    identity,
    featureId,
    beforeRevision: null,
    afterRevision: head.currentRevisionId,
    sourceHash: row.hash,
    statements,
  }
}

/** Append an imported edit while preserving canonical source evidence and accepted placement.
 * @param d Disposable domain. @param row Incoming source. @param prior Previous source. @param before Previous normalized facts. @param incoming New facts. @param mapping Verified crosswalk. @returns Guarded attributed update group.
 */
async function prepareUpdate(
  d: Domain,
  row: FeatureSource['rows'][number],
  prior: FeatureSource['rows'][number],
  before: LocationFacts,
  incoming: LocationFacts,
  mapping: { featureId: string; sourceHash: string },
): Promise<LocationSyncGroup> {
  const current = await readCurrentFeatureRevision(d.db, {
    featureId: mapping.featureId,
    guard: sql`1`,
  })
  if (!current || current.retired) throw Error('retired_or_missing_current_revision')
  const derived = deriveLocationSyncContent(
    current.content,
    before,
    incoming,
    row,
    prior,
  )
  if (derived.conflicts.length)
    throw Error('concurrent_or_reviewed_fields:' + derived.conflicts.join(','))
  const next = derived.content,
    association = next.placement.location
  if (!association) throw Error('detached_feature_requires_review')
  const source = d.sqlite
    .query('SELECT facts FROM locationRevisionContent WHERE id=? AND locationId=?')
    .get(association.factsRevisionId, association.locationId) as {
    facts: string
  } | null
  if (!source) throw Error('Accepted Location source missing')
  const accepted = await sharedLocationFacts(
    d.db,
    association.locationId,
    readLocationFacts(source.facts),
    typeof association.acceptancePolicy?.factsSharedRevision === 'string'
      ? association.acceptancePolicy.factsSharedRevision
      : null,
    association.acceptancePolicy?.factsSharedFields,
  )
  let facts = accepted.facts
  const statements = [
    crosswalkGuard(row, mapping.featureId, mapping.sourceHash, current.revisionId),
  ]
  const phone = next.properties[PHONE]?.selection.value
  const changedPhone =
    row.table === 'donors' &&
    !same(current.content.properties[PHONE]?.selection.value, phone)
  if (changedPhone && phone) {
    const phones = JSON.parse(phone) as string[]
    if (!facts.phoneNumber?.length && phones.length) {
      const head = d.sqlite
        .query('SELECT id FROM locationSharedHead WHERE locationId=?')
        .get(association.locationId) as { id: string } | null
      const shared = await prepareSharedLocationCorrection(d.db, {
        locationId: association.locationId,
        sourceRevisionId: association.factsRevisionId,
        expectedRevision: head?.id ?? null,
        actorId: ACTOR,
        guard: sql`1`,
        draftWorkingCopy: true,
        patch: { phoneNumber: { mode: 'override', value: phones } },
        rights: { canEdit: true, superAdmin: true },
        provenance: {
          kind: 'breadline-source-phone',
          sourceTable: row.table,
          sourceId: row.id,
          sourceHash: row.hash,
        },
      })
      statements.push(...shared.queries.map(q => compile(q)))
      facts = shared.facts
      const pins = Array.isArray(association.acceptancePolicy?.factsSharedFields)
        ? association.acceptancePolicy.factsSharedFields
        : []
      association.acceptancePolicy = {
        ...association.acceptancePolicy,
        lastSharedRevision: shared.id,
        factsSharedFields: [
          ...pins.filter(
            p =>
              typeof p === 'object' &&
              p !== null &&
              'field' in p &&
              p.field !== 'phoneNumber',
          ),
          { field: 'phoneNumber', revision: shared.id },
        ],
      }
    }
    // Exact canonical contact equality removes only the redundant phone override.
    if (same(facts.phoneNumber ?? [], phones))
      delete association.acceptedOverrides.phoneNumber
    else association.acceptedOverrides.phoneNumber = { mode: 'override', value: phones }
  }
  association.associationVersion = crypto.randomUUID()
  association.memberships = association.memberships.map(m => ({
    ...m,
    bindingVersion: association.associationVersion,
  }))
  const prepared = await prepareFeatureEdit(d.db, {
    featureId: mapping.featureId,
    actorId: ACTOR,
    origin: 'import',
    reason: `Breadline ${row.table}:${row.id} source ${row.hash}`,
    revisionBoundary: true,
    guard: sql`1`,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    identity: { actorId: ACTOR },
    validate: () => [],
    derive: () => next,
    templateLocation: content =>
      resolveFeatureLocation(
        facts,
        facts.location,
        FeatureLocationOverridesSchema.parse(
          content.placement.location?.acceptedOverrides ?? {},
        ),
      ),
  })
  if (!prepared) throw Error('Feature changed during planning')
  statements.push(
    compile(prepareRevisionCheck(d.db, prepared.guard)),
    ...prepared.statements.map(q => compile(q)),
    {
      sql: 'UPDATE breadlineImportFeature SET sourceHash=? WHERE sourceTable=? AND sourceId=? AND featureId=? AND sourceHash=?',
      params: [row.hash, row.table, row.id, mapping.featureId, mapping.sourceHash],
    },
  )
  await execute(d, statements)
  return {
    identity: `${row.table}:${row.id}`,
    featureId: mapping.featureId,
    beforeRevision: current.revisionId,
    afterRevision: prepared.revisionId,
    sourceHash: row.hash,
    statements,
  }
}
