// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ATOMIC STAFF PROPAGATION
// 2. PENDING CORRECTION REPLAY
// ---

// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { locationRefreshItem } from '../schema/locationRefresh'
// SERVICES
import { getProjectLocationSettings } from './location'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { locationRulesForOrigin } from '#lib/locations/model.js'
import { evaluateLocationAdoption } from '#lib/locations/policy.js'
import { addressContent, unitContent } from '#lib/locations/adoption.js'
import { fillsMissingLocationValue } from '#lib/locations/missingValue.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import {
  readCurrentFeatureRevision,
  hasFeatureLifecycleStorage,
} from './featureLifecycle'
import { prepareSharedFeatureAdoption } from './locationSharedFeature'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { readSharedLocationCorrection, sharedLocationFacts } from './locationShared'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import {
  FeatureLocationOverridesSchema,
  LocationFactsSchema,
} from '#lib/locations/validation.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'

/** Prepare direct propagation of an authorized shared staff correction.
 * @param db Request database.
 * @param input Exact staff-authored fields and immutable shared revision being saved.
 * @returns Association-set fence and atomic Feature/history/refresh statements.
 * @remarks Call only after shared-resource authorization. Community policy controls each consumer.
 * Accepted fields release Organisation customizations for every consumer; independent Feature names and explicit placements remain independent.
 */
export async function prepareStaffLocationPropagation(
  db: Database,
  input: {
    locationId: string
    sourceRevisionId: string
    sharedRevisionId: string
    actorId: string
    facts: LocationFacts
    fields: string[]
    /** Preserve the authoring Organisation override until a later community revision. */
    authorOrganisation?: {
      id: string
      revision: string | null
      overrides: import('#lib/locations/model.js').FeatureLocationOverrides
    }
  },
): Promise<{ guard: SQL; statements: BatchItem<'sqlite'>[]; featureIds: string[] }> {
  const subjects = sql`SELECT f.id,f.projectId,p.organisationId,b.version,b.acceptancePolicy,p.locationPolicy AS projectPolicy,o.settings AS organisationSettings FROM feature f JOIN featureLocation b ON b.featureId=f.id JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId
    WHERE b.locationId=${input.locationId} AND f.isDraft=0 ORDER BY f.id`
  const rows = await db.all<{
    id: string
    projectId: string
    organisationId: string
    version: string
    projectPolicy: string | null
    organisationSettings: string
    acceptancePolicy: string | null
  }>(subjects)
  // A new link or reassociation during preparation must retry the entire save, not miss the correction.
  const signature = JSON.stringify(
    rows.map(row => [
      row.id,
      row.projectId,
      row.organisationId,
      row.version,
      row.projectPolicy,
      row.organisationSettings,
    ]),
  )
  const guard = sql`(SELECT json_group_array(json_array(id,projectId,organisationId,version,projectPolicy,organisationSettings)) FROM (${subjects}))=${signature}`
  const statements: BatchItem<'sqlite'>[] = []
  let needsReview = false
  const organisationFields = new Map<string, Set<string>>()
  for (const row of rows) {
    const settings = await getProjectLocationSettings(db, row.projectId)
    const rules = locationRulesForOrigin(settings.policy, 'community')
    const accepted = await readCurrentFeatureRevision(db, {
      featureId: row.id,
      guard: sql`1`,
    })
    const binding = accepted?.content.placement.location
    if (!binding) throw new Error('FEATURE_CHANGED')
    const source = await db.get<{ facts: string }>(
      sql`SELECT facts FROM locationRevisionContent AS locationRevision WHERE id=${binding.factsRevisionId} AND locationId=${input.locationId}`,
    )
    if (!source) throw new Error('FEATURE_CHANGED')
    const previous = await sharedLocationFacts(
      db,
      input.locationId,
      readLocationFacts(source.facts),
      typeof binding.acceptancePolicy?.factsSharedRevision === 'string'
        ? binding.acceptancePolicy.factsSharedRevision
        : null,
      binding.acceptancePolicy?.factsSharedFields,
    )
    const positionSource = await db.get<{ facts: string }>(
      sql`SELECT facts FROM locationRevisionContent AS locationRevision WHERE id=${binding.locationRevisionId} AND locationId=${input.locationId}`,
    )
    if (!positionSource) throw new Error('FEATURE_CHANGED')
    const position = await sharedLocationFacts(
      db,
      input.locationId,
      readLocationFacts(positionSource.facts),
      typeof binding.acceptancePolicy?.locationSharedRevision === 'string'
        ? binding.acceptancePolicy.locationSharedRevision
        : null,
    )
    const overrides = FeatureLocationOverridesSchema.parse(binding.acceptedOverrides)
    const before = resolveFeatureLocation(
      previous.facts,
      position.facts.location,
      overrides,
    )
    if (before.location && binding.acceptedGeometry)
      before.location.geometry =
        LocationFactsSchema.shape.location.shape.geometry.parse(
          binding.acceptedGeometry,
        )
    const fields =
      input.authorOrganisation?.id === row.organisationId
        ? input.fields
        : input.fields.filter(field => {
            const previous =
              field === 'groupId' ? before.group : before[field as keyof typeof before]
            const next =
              field === 'groupId'
                ? input.facts.group
                : input.facts[field as keyof LocationFacts]
            if (equalLocationValue(previous, next)) return true
            // Missing-value consent never defeats a deliberate suppression or a relocation.
            const missing = fillsMissingLocationValue(previous, next)
            if (
              rules.acceptMissing &&
              missing &&
              field !== 'location' &&
              !overrides[field as keyof typeof overrides]
            )
              return true
            if (['phoneNumber', 'websites', 'socials'].includes(field))
              return rules.communications !== 'review'
            if (
              [
                'names',
                'brands',
                'branch',
                'format',
                'branchId',
                'brandId',
                'groupId',
                'entity',
              ].includes(field)
            )
              return rules.establishment === 'follow'
            if (field === 'location' && before.location) {
              return (
                evaluateLocationAdoption(
                  {
                    origin: 'community',
                    before: before.location,
                    after: input.facts.location,
                    addressChanged: !equalLocationValue(
                      addressContent(before.location.address),
                      addressContent(input.facts.location.address),
                    ),
                    unitChanged: !equalLocationValue(
                      unitContent(before.location.address),
                      unitContent(input.facts.location.address),
                    ),
                    establishmentChanged: false,
                    missing: {
                      address:
                        !overrides.location &&
                        fillsMissingLocationValue(
                          addressContent(before.location.address),
                          addressContent(input.facts.location.address),
                        ),
                      unit:
                        !overrides.location &&
                        fillsMissingLocationValue(
                          unitContent(before.location.address),
                          unitContent(input.facts.location.address),
                        ),
                    },
                  },
                  settings.policy,
                ).location === 'adopt'
              )
            }
            return false
          })
    const acceptedFields =
      organisationFields.get(row.organisationId) ?? new Set<string>()
    for (const field of fields) acceptedFields.add(field)
    organisationFields.set(row.organisationId, acceptedFields)
  }
  // Acceptance belongs to the Organisation: one accepting Project releases that field for all its consumers.
  for (const [organisationId, acceptedFields] of organisationFields) {
    const fields = [...acceptedFields]
    needsReview ||= fields.length !== input.fields.length
    if (!fields.length) continue
    const author =
      input.authorOrganisation?.id === organisationId
        ? input.authorOrganisation
        : undefined
    let organisation: {
      revision: string | null
      overrides: import('#lib/locations/model.js').FeatureLocationOverrides
    }
    if (author) {
      // The author write may be earlier in this batch; assert its head before projecting consumers.
      statements.push(
        prepareRevisionCheck(
          db,
          author.revision
            ? sql`(SELECT revision FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${input.locationId})=${author.revision}`
            : sql`NOT EXISTS(SELECT 1 FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${input.locationId})`,
        ),
      )
      organisation = { revision: author.revision, overrides: author.overrides }
    } else {
      const current = await readOrganisationLocation(
        db,
        organisationId,
        input.locationId,
      )
      const overrides = structuredClone(current?.overrides ?? {})
      for (const field of fields) {
        delete (overrides as Record<string, unknown>)[field]
        if (overrides.freshness) delete overrides.freshness[field]
      }
      const headFence = current
        ? sql`(SELECT revision FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${input.locationId})=${current.revision}`
        : sql`NOT EXISTS(SELECT 1 FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${input.locationId})`
      const write = await prepareOrganisationLocationWrite(db, {
        organisationId,
        locationId: input.locationId,
        actorId: input.actorId,
        overrides,
        guard: headFence,
        provenance: {
          kind: 'community-acceptance',
          sharedRevisionId: input.sharedRevisionId,
          fields,
        },
      })
      statements.push(prepareRevisionCheck(db, headFence), ...write.queries)
      organisation = { revision: write.revision, overrides }
    }
    for (const row of rows.filter(row => row.organisationId === organisationId)) {
      const prepared = await prepareSharedFeatureAdoption(db, {
        ...input,
        action: 'staff-update',
        featureId: row.id,
        projectId: row.projectId,
        fields,
        organisation,
        includeLocation: fields.includes('location'),
        guard: sql`EXISTS(SELECT 1 FROM feature f JOIN featureLocation b ON b.featureId=f.id
        WHERE f.id=${row.id} AND f.projectId=${row.projectId} AND f.isDraft=0
          AND b.locationId=${input.locationId} AND b.version=${row.version})`,
      })
      if (!prepared) throw new Error('FEATURE_CHANGED')
      statements.push(prepareRevisionCheck(db, prepared.guard), ...prepared.statements)
    }
  }
  // Leave the durable refresh queued when any consumer retains fields for review.
  if (!needsReview)
    statements.push(
      db
        .update(locationRefreshItem)
        .set({ status: 'processed' })
        .where(
          and(
            eq(locationRefreshItem.runId, `shared:${input.sharedRevisionId}`),
            eq(locationRefreshItem.locationId, input.locationId),
            eq(locationRefreshItem.origin, 'local'),
          ),
        ),
    )
  return { guard, statements, featureIds: rows.map(row => row.id) }
}

/** Replay a pending staff correction through the same atomic path used by Save.
 * @param db Primary-session database.
 * @param locationId Exact refresh subject.
 * @param revisionId Exact immutable shared correction; never resolve a later head on its behalf.
 * @returns Null for system/superseded evidence, otherwise the committed/conflicting replay result.
 * @remarks Provenance and unchanged source pins prevent staff authority from leaking into upstream updates.
 */
export async function replayStaffLocationCorrection(
  db: Database,
  locationId: string,
  revisionId: string,
): Promise<'processed' | 'conflict' | null> {
  if (!(await hasFeatureLifecycleStorage(db))) return null
  const shared = await readSharedLocationCorrection(db, locationId)
  if (!shared || shared.id !== revisionId) return null
  const provenance = JSON.parse(shared.provenance)
  if (
    !['staff-correction', 'location-editor', 'feature-community-edit'].includes(
      provenance.kind,
    )
  )
    return null
  // Replay other consumers while retaining the author's current Organisation choices.
  const author =
    typeof provenance.authorOrganisationId === 'string'
      ? await readOrganisationLocation(db, provenance.authorOrganisationId, locationId)
      : null
  const source = await db.get<{ id: string; facts: string }>(sql`
    SELECT id,facts FROM locationRevisionContent AS locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1`)
  if (!source || source.id !== shared.sourceRevisionId) return null
  const previous = await db.get<{ corrections: string }>(sql`
    SELECT p.corrections FROM locationSharedRevision r JOIN locationSharedRevision p ON p.id=r.previousRevisionId
    WHERE r.id=${revisionId}`)
  const before = JSON.parse(previous?.corrections ?? '{}')
  const after = JSON.parse(shared.corrections)
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    field => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  )
  const effective = await sharedLocationFacts(
    db,
    locationId,
    readLocationFacts(source.facts),
    revisionId,
  )
  const prepared = await prepareStaffLocationPropagation(db, {
    locationId,
    sourceRevisionId: source.id,
    sharedRevisionId: revisionId,
    actorId: shared.actorId,
    facts: effective.facts,
    fields,
    ...(author
      ? {
          authorOrganisation: {
            id: provenance.authorOrganisationId,
            revision: author.revision,
            overrides: author.overrides,
          },
        }
      : {}),
  })
  const guard = sql`(${prepared.guard}) AND
    (SELECT id FROM locationSharedHead WHERE locationId=${locationId})=${revisionId} AND
    (SELECT id FROM locationRevisionContent AS locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1)=${source.id} AND
    EXISTS(SELECT 1 FROM locationRefreshItem WHERE runId=${`shared:${revisionId}`} AND locationId=${locationId} AND origin='local' AND status='pending')`
  return (await executeRevisionBatch(db, guard, prepared.statements))
    ? 'processed'
    : 'conflict'
}
