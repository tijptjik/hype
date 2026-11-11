// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
import { locationSharedRevision } from '../schema/locationShared'
// DOMAIN
import {
  amendSharedCorrections,
  authorizeSharedCorrection,
  omittedSourceContacts,
  resolveSharedCorrections,
  SharedCorrectionPatchSchema,
  SharedCorrectionFieldSchema,
} from '#lib/locations/sharedCorrection.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// TRANSACTIONS
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  SharedCorrections,
  SharedCorrectionPatch,
} from '#lib/locations/sharedCorrection.js'
import type { LocationFacts } from '#lib/locations/model.js'

type SharedRow = {
  id: string
  locationId: string
  sourceRevisionId: string
  corrections: string
  actorId: string
  createdAt: string
  provenance: string
}

/** Read an explicit historical correction pin or the current head.
 * @param db Database. @param locationId Scoped identity. @param revision Undefined selects current; null means no correction.
 * @returns Immutable evidence, or null. Old databases read their original source until migrated.
 */
export async function readSharedLocationCorrection(
  db: Database,
  locationId: string,
  revision?: string | null,
): Promise<SharedRow | null> {
  if (revision === null) return null
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='locationSharedRevision' AND type='table'`,
  )
  if (!storage?.n) return null
  return (
    (await db.get<SharedRow>(sql`SELECT r.* FROM locationSharedRevision r WHERE r.locationId=${locationId}
    AND ${revision ? sql`r.id=${revision}` : sql`NOT EXISTS(SELECT 1 FROM locationSharedRevision n WHERE n.previousRevisionId=r.id)`}`)) ??
    null
  )
}

/** Resolve a pinned correction below Organisation overrides without modifying source snapshots.
 * @param db Database. @param locationId Scoped identity. @param facts Pinned source facts.
 * @param revision Exact accepted shared pin; undefined explicitly requests the latest shared record.
 * @param fieldPins Optional field-specific accepted corrections from direct staff saves.
 * @returns Effective Hype facts and correction identity.
 */
export async function sharedLocationFacts(
  db: Database,
  locationId: string,
  facts: LocationFacts,
  revision?: string | null,
  fieldPins?: unknown,
): Promise<{ facts: LocationFacts; revision: string | null }> {
  const row = await readSharedLocationCorrection(db, locationId, revision)
  if (revision && !row) throw new Error('SHARED_LOCATION_REVISION_UNAVAILABLE')
  const resolved = row
    ? resolveSharedCorrections(facts, JSON.parse(row.corrections), false).facts
    : structuredClone(facts)
  // Field pins allow a contact edit without implicitly accepting a pending name or address change.
  if (Array.isArray(fieldPins)) {
    if (fieldPins.length > SharedCorrectionFieldSchema.options.length)
      throw new Error('SHARED_LOCATION_PINS_INVALID')
    for (const pin of fieldPins) {
      if (
        !pin ||
        !SharedCorrectionFieldSchema.safeParse(pin.field).success ||
        (pin.revision !== null && typeof pin.revision !== 'string')
      )
        throw new Error('SHARED_LOCATION_PINS_INVALID')
      const field = pin.field as keyof LocationFacts
      const pinned = await sharedLocationFacts(db, locationId, facts, pin.revision)
      Object.assign(resolved, { [field]: pinned.facts[field] })
    }
  }
  return { facts: resolved, revision: row?.id ?? null }
}

/** Prepare an attributed shared edit under source/head/scope concurrency fences.
 * @param db Database. @param input Server-authorized scope, explicit patch and displayed source/head pins.
 * @returns Statements to batch with the originating Feature's accepted revision.
 * @remarks Permissioned community editors may curate identity fields; consumer policies govern adoption.
 */
export async function prepareSharedLocationCorrection(
  db: Database,
  input: {
    locationId: string
    sourceRevisionId: string
    expectedRevision: string | null
    actorId: string
    patch: SharedCorrectionPatch
    guard: SQL
    rights: { canEdit: boolean; superAdmin: boolean }
    provenance?: Record<string, unknown>
  },
) {
  const patch = SharedCorrectionPatchSchema.parse(input.patch)
  authorizeSharedCorrection(patch, input.rights)
  const source = await db.get<{
    facts: string
    kind: string
    rawSource: string
  }>(sql`SELECT r.facts,r.rawSource,l.kind FROM locationRevision r JOIN location l ON l.id=r.locationId
    WHERE r.id=${input.sourceRevisionId} AND l.id=${input.locationId} AND l.state!='redirect'
    AND r.id=(SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1) AND (${input.guard})`)
  const previous = await readSharedLocationCorrection(db, input.locationId)
  if (!source || (previous?.id ?? null) !== input.expectedRevision)
    throw new Error('SHARED_LOCATION_CHANGED')
  if (
    (patch.branch ||
      patch.format ||
      patch.branchId ||
      patch.brandId ||
      patch.groupId) &&
    source.kind !== 'establishment'
  )
    throw new Error('BRANCH_REQUIRES_ESTABLISHMENT')
  const facts = readLocationFacts(source.facts)
  const id = crypto.randomUUID(),
    editedAt = new Date().toISOString()
  const corrections = amendSharedCorrections(
    previous ? JSON.parse(previous.corrections) : {},
    patch,
    facts,
    {
      actorId: input.actorId,
      editedAt,
      sourceRevisionId: input.sourceRevisionId,
      omittedFields: omittedSourceContacts(source.rawSource),
    },
  )
  const guard = sql`(${input.guard}) AND (SELECT id FROM locationSharedHead WHERE locationId=${input.locationId}) IS ${input.expectedRevision}
    AND (SELECT id FROM locationRevision WHERE locationId=${input.locationId} ORDER BY version DESC LIMIT 1)=${input.sourceRevisionId}`
  const queries = [
    prepareRevisionCheck(db, guard),
    db.insert(locationSharedRevision).values({
      id,
      locationId: input.locationId,
      previousRevisionId: input.expectedRevision,
      sourceRevisionId: input.sourceRevisionId,
      corrections,
      actorId: input.actorId,
      provenance: input.provenance ?? { kind: 'staff-correction' },
      createdAt: editedAt,
    }),
  ]
  return {
    id,
    queries,
    facts: resolveSharedCorrections(
      facts,
      corrections,
      true,
      omittedSourceContacts(source.rawSource),
    ).facts,
    corrections,
    guard,
  }
}

/** Retire changed-source contact corrections durably so a later reversion cannot resurrect them.
 * @param db Database. @param locationId Mirrored identity. @param sourceRevisionId Newly ingested forward source revision.
 * @returns Completion; unchanged source fields retain corrections and their original attribution.
 */
export async function reconcileSharedLocationSource(
  db: Database,
  locationId: string,
  sourceRevisionId: string,
): Promise<void> {
  const head = await readSharedLocationCorrection(db, locationId)
  if (!head) return
  const source = await db.get<{ facts: string; rawSource: string }>(
    sql`SELECT facts,rawSource FROM locationRevision WHERE id=${sourceRevisionId} AND locationId=${locationId}`,
  )
  if (!source) throw new Error('SHARED_LOCATION_SOURCE_UNAVAILABLE')
  const corrections: SharedCorrections = JSON.parse(head.corrections)
  const resolved = resolveSharedCorrections(
    readLocationFacts(source.facts),
    corrections,
    true,
    omittedSourceContacts(source.rawSource),
  )
  let changed = false
  for (const [field, status] of Object.entries(resolved.status)) {
    const entry = corrections[field as keyof SharedCorrections]
    if (
      entry &&
      !entry.supersededBy &&
      (status === 'superseded' || status === 'agreed')
    ) {
      entry.supersededBy = sourceRevisionId
      changed = true
    }
  }
  if (!changed) return
  const saved = await executeRevisionBatch(
    db,
    sql`(SELECT id FROM locationSharedHead WHERE locationId=${locationId})=${head.id}
    AND (SELECT id FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1)=${sourceRevisionId}`,
    [
      db.insert(locationSharedRevision).values({
        id: crypto.randomUUID(),
        locationId,
        previousRevisionId: head.id,
        sourceRevisionId,
        corrections,
        actorId: 'system:source-sync',
        provenance: { kind: 'source-superseded', sourceRevisionId },
      }),
    ],
  )
  if (!saved) throw new Error('SHARED_LOCATION_CHANGED')
}

/** Retire Organisation overrides only under their explicit follow policy.
 * @param db Database. @param locationId Shared subject. @param sourceRevisionId Forward publisher revision.
 * @returns Completion; supersession is append-only and cannot resurrect on a later source reversion.
 */
export async function reconcileOrganisationSourcePolicies(
  db: Database,
  locationId: string,
  sourceRevisionId: string,
): Promise<void> {
  const { prepareOrganisationLocationWrite } = await import('./organisationLocation')
  const { equalLocationValue } = await import('#lib/locations/baseline.js')
  const source = await db.get<{ facts: string; rawSource: string }>(
    sql`SELECT facts,rawSource FROM locationRevision WHERE id=${sourceRevisionId} AND locationId=${locationId}`,
  )
  if (!source) return
  const facts = (
    await sharedLocationFacts(db, locationId, readLocationFacts(source.facts))
  ).facts
  const sharedHead = await readSharedLocationCorrection(db, locationId)
  const activeCorrections: SharedCorrections = sharedHead
    ? JSON.parse(sharedHead.corrections)
    : {}
  const omitted = omittedSourceContacts(source.rawSource).filter(field => {
    const entry = activeCorrections[field as keyof SharedCorrections]
    return !entry || Boolean(entry.supersededBy) || entry.choice.mode === 'inherit'
  })
  const heads = await db.all<{
    organisationId: string
    revision: string
    overrides: string
  }>(
    sql`SELECT organisationId,revision,overrides FROM organisationLocationHead WHERE locationId=${locationId} AND json_type(overrides,'$.freshness')='object'`,
  )
  for (const head of heads) {
    const overrides: import('#lib/locations/model.js').FeatureLocationOverrides =
      JSON.parse(head.overrides)
    let changed = false
    for (const [field, policy] of Object.entries(overrides.freshness ?? {})) {
      if (
        policy.mode !== 'follow' ||
        omitted.includes(field) ||
        !Object.hasOwn(facts, field) ||
        equalLocationValue(facts[field as keyof LocationFacts], policy.original)
      )
        continue
      if (field === 'names')
        overrides.names = Object.fromEntries(
          Object.keys(overrides.names ?? {}).map(locale => [
            locale,
            { mode: 'inherit' as const },
          ]),
        )
      else Object.assign(overrides, { [field]: { mode: 'inherit' } })
      policy.original = facts[field as keyof LocationFacts]
      changed = true
    }
    if (!changed) continue
    const guard = sql`(SELECT revision FROM organisationLocationHead WHERE organisationId=${head.organisationId} AND locationId=${locationId})=${head.revision}
      AND (SELECT id FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1)=${sourceRevisionId}`
    const write = await prepareOrganisationLocationWrite(db, {
      organisationId: head.organisationId,
      locationId,
      actorId: 'system:source-sync',
      overrides,
      guard,
      provenance: { kind: 'organisation-follow-policy', sourceRevisionId },
    })
    if (
      !(await executeRevisionBatch(db, guard, [
        ...write.queries,
        prepareRevisionCheck(db, write.guard),
      ]))
    )
      throw new Error('ORGANISATION_LOCATION_CHANGED')
  }
}
