import { locationRulesForOrigin } from '#lib/locations/model.js'
import { canonicalLocationSQL } from './locationRedirect'
import { RelationshipEvidenceSchema } from '#lib/locations/relationships.js'
// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { feature, featureI18n } from '../schema/feature'
import {
  featureLocation,
  locationRevision,
  locationAdoptionProposal,
} from '../schema/location'
import { addressRevision } from '../schema/locationRelationships'
// DOMAIN
import {
  LocalLocationAddressSchema,
  createLocalLocationAddress,
} from '#lib/addresses/localLocationAddress.js'
import {
  FeatureAddressSchema,
  emptyFeatureAddress,
  getAddressDisplay,
  ADDRESS_LOCALES,
} from '#lib/addresses/featureAddress.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import {
  reconcileAddressFields,
  PlacementDecisionSchema,
  type PlacementDecision,
  type PlacementEvidence,
} from '#lib/locations/placement.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { getProjectLocationSettings } from './location'
import { getLayerRelocationSettings } from './layerLocationPolicy'
import { relationshipScopeSql } from './locationRelationships'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { planLocationAdoption } from '#lib/locations/adoption.js'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { readFeatureLocationRevisionMemberships } from './featureLocationRevision'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Point } from 'geojson'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Scoped target assessment
// 2. Immutable proposals
// 3. Atomic decisions and materialization
// 4. Bounded fan-out
// ---

type Target = {
  additionalGuard?: SQL
  featureId: string
  projectId: string
  occupancyRevisionId?: string
  addressRevisionId?: string
}
type Head = PlacementEvidence['relationshipHeads'][number]
/** Guard the exact resolved relationship snapshot, including scoped suppression.
 * @param heads Accepted dependency snapshots. @param organisationId Persisted scope.
 * @returns Predicate invalidated by any replacement or suppression.
 */
function headsGuard(heads: Head[], organisationId: string): SQL {
  return and(
    ...(['locationOccupancy', 'locationMembership', 'locationAddress'] as const).map(
      table => {
        const endpoints =
          table === 'locationOccupancy'
            ? ['establishmentLocationId', 'containerLocationId']
            : table === 'locationMembership'
              ? ['childLocationId', 'parentLocationId']
              : ['locationId']
        const visible = and(
          ...endpoints.map(
            key =>
              sql`(r.${sql.identifier(key)} IS NULL OR EXISTS(SELECT 1 FROM location l WHERE l.id=${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)} AND l.state!='redirect' AND (l.state!='manual' OR l.ownerOrganisationId=${organisationId})))`,
          ),
        )!
        return sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(heads.filter(h => h.table === table).map(h => h.id))}) j WHERE NOT EXISTS(SELECT 1 FROM ${sql.identifier(table + 'Head')} r WHERE r.id=j.value AND r.assertionState='asserted' AND ${relationshipScopeSql(table, organisationId)} AND ${visible}))`
      },
    ),
  )!
}
/** Capture every resolved head in the assessed neighborhood, including absence of competing heads.
 * @param ids Subject and examined containers. @param scope Persisted Organisation.
 * @returns Deterministic SQL signature used at read and commit time.
 */
function relationshipSignature(ids: string[], scope: string): SQL {
  const encoded = JSON.stringify(ids)
  const parts = (
    ['locationOccupancy', 'locationMembership', 'locationAddress'] as const
  ).map(table => {
    const subject =
      table === 'locationOccupancy'
        ? 'establishmentLocationId'
        : table === 'locationMembership'
          ? 'childLocationId'
          : 'locationId'
    return sql`SELECT r.id FROM ${sql.identifier(table + 'Head')} r WHERE ${canonicalLocationSQL(sql`r.${sql.identifier(subject)}`)} IN (SELECT value FROM json_each(${encoded})) AND ${relationshipScopeSql(table, scope)}`
  })
  return sql`(SELECT json_group_array(id) FROM (SELECT id FROM (${sql.join(parts, sql` UNION ALL `)}) ORDER BY id))`
}
/** Read a current, visible relationship head in the Feature's persisted Organisation scope.
 * @param db Request database. @param table Trusted table. @param id Immutable target. @param scope Persisted owner.
 * @returns Resolved row or undefined; private/obsolete targets are never exposed.
 */
async function resolvedHead(
  db: Database,
  table: Head['table'],
  id: string,
  scope: string,
): Promise<Record<string, unknown> | undefined> {
  return db.get(
    sql`SELECT r.* FROM ${sql.identifier(table + 'Head')} r WHERE r.id=${id} AND r.assertionState='asserted' AND ${relationshipScopeSql(table, scope)}`,
  )
}
/** Determine an evidenced target without treating a name change or proximity as continuity.
 * @param db Request database. @param input Authorized Feature and exact canonical/occupancy target.
 * @returns Complete assessment or null for an inaccessible/incompatible identity.
 */
export async function assessLocationPlacement(db: Database, input: Target) {
  const row = await db
    .select({ parent: feature, binding: featureLocation })
    .from(feature)
    .innerJoin(featureLocation, eq(feature.id, featureLocation.featureId))
    .where(
      and(
        eq(feature.id, input.featureId),
        eq(feature.projectId, input.projectId),
        eq(feature.isDraft, false),
      ),
    )
    .get()
  if (!row) return null
  const { parent, binding } = row
  const owner = await db.get<{ organisationId: string }>(
    sql`SELECT organisationId FROM project WHERE id=${input.projectId}`,
  )
  if (!owner || !parent.layerId) return null
  const scope = owner.organisationId
  const visible = async (id: string): Promise<boolean> =>
    Boolean(
      await db.get(
        sql`SELECT id FROM location WHERE id=${canonicalLocationSQL(sql`${id}`)} AND state!='redirect' AND (state!='manual' OR ownerOrganisationId=${scope})`,
      ),
    )
  if (!(await visible(binding.locationId))) return null
  const [settings, layerSettings, correction] = await Promise.all([
    getProjectLocationSettings(db, input.projectId),
    getLayerRelocationSettings(db, parent.layerId),
    readOrganisationLocation(db, scope, binding.locationId),
  ])
  if (!layerSettings || layerSettings.projectId !== input.projectId) return null
  let occupancyEvidence: PlacementEvidence['occupancyEvidence'] = []
  let occupancyVerifiedAt: string | null = null
  const scannedLocationIds = new Set<string>([binding.locationId])
  const heads: Head[] = [],
    membershipRevisionIds: string[] = [],
    blockers: string[] = []
  let changeOrigin: 'saanseoi' | 'community' = 'saanseoi'
  let occupancyRevisionId = binding.occupancyRevisionId,
    targetAddress = input.addressRevisionId,
    container = binding.locationId
  const kind =
    input.occupancyRevisionId &&
    input.occupancyRevisionId !== binding.occupancyRevisionId
      ? 'relocation'
      : 'address'
  if (kind === 'relocation') {
    // Occupancy assertions are authored in Hype; linking publisher evidence does not change authorship.
    changeOrigin = 'community'
    const occupancy = await resolvedHead(
      db,
      'locationOccupancy',
      input.occupancyRevisionId!,
      scope,
    )
    if (!occupancy) return null
    const subject = await db.get<{ id: string }>(
      sql`SELECT ${canonicalLocationSQL(sql`${occupancy.establishmentLocationId}`)} id`,
    )
    if (subject?.id !== binding.locationId) return null
    occupancyEvidence = RelationshipEvidenceSchema.array().parse(
      JSON.parse(String(occupancy.evidence)),
    )
    occupancyVerifiedAt = occupancy.verifiedAt ? String(occupancy.verifiedAt) : null
    occupancyRevisionId = String(occupancy.id)
    if (
      occupancy.containerLocationId &&
      !(await visible(String(occupancy.containerLocationId)))
    )
      return null
    container = occupancy.containerLocationId
      ? (await db.get<{ id: string }>(
          sql`SELECT ${canonicalLocationSQL(sql`${occupancy.containerLocationId}`)} id`,
        ))!.id
      : ''
    targetAddress = occupancy.addressRevisionId
      ? String(occupancy.addressRevisionId)
      : undefined
    heads.push({
      table: 'locationOccupancy',
      id: occupancyRevisionId,
      relationshipId: String(occupancy.relationshipId),
    })
    if (
      occupancy.occupancyState !== 'current' ||
      !occupancy.verifiedAt ||
      !JSON.parse(String(occupancy.evidence)).length
    )
      blockers.push('unverified-occupancy')
    if (
      occupancy.effectiveTo ||
      (occupancy.effectiveFrom &&
        String(occupancy.effectiveFrom) >
          new Date().toISOString().slice(0, String(occupancy.effectiveFrom).length))
    )
      blockers.push('planned-or-ended-occupancy')
    const competing = await db.all(
      sql`SELECT r.id FROM locationOccupancyHead r WHERE ${canonicalLocationSQL(sql`r.establishmentLocationId`)}=${binding.locationId} AND r.occupancyState='current' AND r.assertionState='asserted' AND ${relationshipScopeSql('locationOccupancy', scope)} LIMIT 2`,
    )
    if (competing.length !== 1) blockers.push('ambiguous-occupancy')
  }
  if (container) scannedLocationIds.add(container)
  if (!targetAddress && container) {
    const choices = await db.all<{
      id: string
      relationshipId: string
      addressRevisionId: string
    }>(
      sql`SELECT r.id,r.relationshipId,r.addressRevisionId FROM locationAddressHead r WHERE ${canonicalLocationSQL(sql`r.locationId`)}=${container} AND r.addressState='current' AND r.assertionState='asserted' AND ${relationshipScopeSql('locationAddress', scope)} ORDER BY r.priority IS NULL,r.priority LIMIT 2`,
    )
    if (choices.length === 1) {
      targetAddress = choices[0].addressRevisionId
      heads.push({
        table: 'locationAddress',
        id: choices[0].id,
        relationshipId: choices[0].relationshipId,
      })
    }
  }
  const canonical = targetAddress
    ? await db
        .select()
        .from(addressRevision)
        .where(eq(addressRevision.id, targetAddress))
        .get()
    : undefined
  if (kind === 'address')
    changeOrigin = canonical?.sourceReferences.some(ref => ref.provider === 'saanseoi')
      ? 'saanseoi'
      : 'community'
  const content = canonical
    ? LocalLocationAddressSchema.safeParse(canonical.components)
    : null
  if (!canonical || !content?.success) {
    if (kind === 'address') return null
    targetAddress = undefined
    blockers.push('missing-destination-address')
  }
  if (kind === 'address' && canonical) {
    if (binding.addressRevisionId === targetAddress) return null
    if (!binding.addressRevisionId) {
      const identity = await db.get<{ sourceKey: string }>(
        sql`SELECT sourceKey FROM address WHERE id=${canonical.addressId}`,
      )
      const accepted = await db
        .select({ facts: locationRevision.facts })
        .from(locationRevision)
        .where(eq(locationRevision.id, binding.locationRevisionId))
        .get()
      if (
        !identity ||
        JSON.parse(identity.sourceKey).provider !== 'saanseoi' ||
        JSON.parse(identity.sourceKey).family !== 'addresses' ||
        JSON.parse(identity.sourceKey).id !==
          accepted?.facts.location.address.address2dId
      )
        return null
    } else {
      const base = await db
        .select()
        .from(addressRevision)
        .where(eq(addressRevision.id, binding.addressRevisionId))
        .get()
      if (!base || base.addressId !== canonical.addressId) return null
      // A source correction must be a forward retained version of the continuing address identity.
      const newer = await db.get(
        sql`SELECT 1 FROM addressRevision a,addressRevision b WHERE a.id=${targetAddress} AND b.id=${binding.addressRevisionId} AND a.rowid>b.rowid`,
      )
      if (!newer) return null
    }
    membershipRevisionIds.push(...binding.membershipRevisionIds)
  } else {
    // Retain exact connected ancestry; fail closed on overlarge or cyclic paths.
    const pending = container ? [container] : [],
      seen = new Set<string>()
    while (pending.length && seen.size < 30) {
      const child = pending.shift()!
      if (seen.has(child)) continue
      seen.add(child)
      scannedLocationIds.add(child)
      const parents = await db.all<{
        id: string
        relationshipId: string
        parentLocationId: string
      }>(
        sql`SELECT r.id,r.relationshipId,${canonicalLocationSQL(sql`r.parentLocationId`)} parentLocationId FROM locationMembershipHead r WHERE ${canonicalLocationSQL(sql`r.childLocationId`)}=${child} AND r.membershipState='current' AND r.assertionState='asserted' AND ${relationshipScopeSql('locationMembership', scope)} LIMIT 31`,
      )
      if (parents.length > 30) {
        blockers.push('ambiguous-containers')
        break
      }
      for (const link of parents) {
        if (!(await visible(link.parentLocationId))) return null
        membershipRevisionIds.push(link.id)
        heads.push({
          table: 'locationMembership',
          id: link.id,
          relationshipId: link.relationshipId,
        })
        pending.push(link.parentLocationId)
      }
    }
    if (pending.length) blockers.push('ambiguous-containers')
  }
  const priorAddress = FeatureAddressSchema.safeParse(parent.addressMeta?.address)
  const oldAddress = priorAddress.success ? priorAddress.data : emptyFeatureAddress()
  const beforeAccessHints = {
    ...oldAddress.accessHints,
    ...binding.placementOverrides.accessHints,
  }
  const acceptedFields = binding.overrides.address?.fields ?? {}
  const beforeOverrides = Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(acceptedFields),
        ...Object.keys(oldAddress.overrides),
      ]),
    ].map(locale => [
      locale,
      { ...acceptedFields[locale], ...oldAddress.overrides[locale] },
    ]),
  )
  let geometry = kind === 'relocation' ? canonical?.geometry : parent.geometry
  if (!geometry || geometry.type !== 'Point') geometry = null
  if (!geometry) blockers.push('missing-destination-pin')
  if (kind === 'relocation') {
    if (Object.values(beforeAccessHints).some(Boolean))
      blockers.push('access-directions')
    if (
      Object.keys(beforeOverrides).length ||
      oldAddress.unitDetails ||
      binding.overrides.location?.mode === 'override'
    )
      blockers.push('local-placement')
  }
  const locationIds = [...scannedLocationIds].sort()
  const snapshot = await db.get<{ signature: string }>(
    sql`SELECT ${relationshipSignature(locationIds, scope)} signature`,
  )
  const placement: PlacementEvidence = {
    beforeAddressDisplay: getAddressDisplay(oldAddress, 'en'),
    occupancyEvidence,
    occupancyVerifiedAt,
    relationshipSnapshot: { locationIds, signature: snapshot!.signature },
    version: 1,
    kind,
    occupancyRevisionId,
    addressRevisionId: targetAddress ?? null,
    membershipRevisionIds: [...new Set(membershipRevisionIds)],
    relationshipHeads: heads,
    beforeUnitDetails: oldAddress.unitDetails ?? null,
    organisationRevision: correction?.revision ?? null,
    geometry: geometry as PlacementEvidence['geometry'],
    policy:
      kind === 'relocation'
        ? locationRulesForOrigin(settings.policy, changeOrigin).relocation
        : locationRulesForOrigin(settings.policy, changeOrigin).address,
    blockers,
    beforeAddressRevisionId: binding.addressRevisionId,
    beforeAccessHints,
    beforeOverrides,
    beforeGeometry: parent.geometry,
    content: content?.success ? content.data : null,
  }
  return {
    parent,
    binding,
    scope,
    settings,
    layerSettings,
    canonical,
    placement,
    oldAddress,
    correction,
  }
}
/** Append a placement assessment in the existing immutable proposal store.
 * @param db Request database. @param input Exact target and persisted Feature scope.
 * @returns Newest assessment, or null for fixed relocation/unavailable target. Rejected targets stay rejected.
 */
export async function proposeLocationPlacement(db: Database, input: Target) {
  if (
    input.additionalGuard &&
    !(await db.get(sql`SELECT 1 WHERE ${input.additionalGuard}`))
  )
    return null
  const assessed = await assessLocationPlacement(db, input)
  if (
    !assessed ||
    (assessed.placement.kind === 'relocation' && assessed.placement.policy === 'fixed')
  )
    return null
  const { parent, binding, placement, settings, layerSettings } = assessed
  const existing = await db
    .select()
    .from(locationAdoptionProposal)
    .where(
      and(
        eq(locationAdoptionProposal.featureId, input.featureId),
        eq(locationAdoptionProposal.projectId, input.projectId),
        eq(locationAdoptionProposal.locationId, binding.locationId),
        sql`occupancyRevisionId IS ${placement.occupancyRevisionId} AND addressRevisionId IS ${placement.addressRevisionId} AND json_extract(evidence,'$.placement.kind')=${placement.kind}`,
      ),
    )
    .orderBy(sql`rowid DESC`)
    .get()
  if (
    existing?.locationDecision ||
    (existing?.associationRevision === binding.version &&
      existing.policyRevision === settings.revision &&
      existing.layerPolicyRevision === layerSettings.revision &&
      equalLocationValue(existing.evidence.placement, placement))
  )
    return existing
  // Placement uses retained accepted snapshots even when its publisher no longer lists the entity.
  const [facts, location] = await Promise.all(
    [binding.factsRevisionId, binding.locationRevisionId].map(id =>
      db
        .select()
        .from(locationRevision)
        .where(
          and(
            eq(locationRevision.id, id),
            eq(locationRevision.locationId, binding.locationId),
          ),
        )
        .get(),
    ),
  )
  if (!facts || !location) return null
  const base = {
    plan: planLocationAdoption({
      facts,
      location,
      candidate: facts.version > location.version ? facts : location,
      overrides: binding.overrides,
      policy: settings.policy,
    }),
  }
  const requiresReview =
    placement.policy !== 'follow' ||
    placement.blockers.length > 0 ||
    Object.keys(
      reconcileAddressFields(
        placement.beforeOverrides,
        placement.content ?? createLocalLocationAddress(),
      ),
    ).length > 0
  const evidence = {
    policy: settings.policy,
    plan: {
      ...base.plan,
      decision: {
        ...base.plan.decision,
        facts: 'review' as const,
        location: requiresReview ? ('review' as const) : ('adopt' as const),
      },
    },
    placement,
  }
  const id = crypto.randomUUID()
  const evidenceJson = JSON.stringify(evidence)
  await db
    .insert(locationAdoptionProposal)
    .select(sql`SELECT ${id},${input.featureId},${input.projectId},${binding.locationId},${binding.locationRevisionId},${binding.version},${parent.modifiedAt},${settings.revision},${evidenceJson},${placement.organisationRevision ?? ''},NULL,NULL,${placement.occupancyRevisionId},${placement.addressRevisionId},${parent.layerId},${layerSettings.revision},strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE (${input.additionalGuard ?? sql`1`}) AND ${headsGuard(placement.relationshipHeads, assessed.scope)} AND ${relationshipSignature(placement.relationshipSnapshot.locationIds, assessed.scope)}=${placement.relationshipSnapshot.signature}
    AND EXISTS(SELECT 1 FROM feature f JOIN featureLocation b ON b.featureId=f.id JOIN project p ON p.id=f.projectId JOIN layer l ON l.id=f.layerId WHERE f.id=${parent.id} AND f.projectId=${input.projectId} AND f.modifiedAt=${parent.modifiedAt} AND b.version=${binding.version} AND f.layerId=${parent.layerId} AND p.locationPolicyRevision=${settings.revision} AND l.relocationPolicyRevision=${layerSettings.revision})
    AND COALESCE((SELECT revision FROM organisationLocationHead WHERE organisationId=${assessed.scope} AND locationId=${binding.locationId}),'')=${placement.organisationRevision ?? ''}`)
    .onConflictDoNothing()

  return db
    .select()
    .from(locationAdoptionProposal)
    .where(
      and(
        eq(locationAdoptionProposal.featureId, input.featureId),
        sql`occupancyRevisionId IS ${placement.occupancyRevisionId} AND addressRevisionId IS ${placement.addressRevisionId}`,
      ),
    )
    .orderBy(sql`rowid DESC`)
    .get()
}

/** Decide one exact placement target; never overwrite immutable evidence or prior decisions.
 * @param db Request database. @param input Server-authorized scope, editor fences and explicit choices.
 * @returns Applied/rejected/deferred receipt or non-mutating conflict/review result.
 * @remarks Automatic moves cannot clear directions or overrides. Every write is fenced to ancestry,
 * policy counters, relationship heads, correction head and the original binding/Feature versions.
 */
export async function decideLocationPlacement(
  db: Database,
  input: {
    featureId: string
    projectId: string
    proposalId: string
    expectedRevision: string
    expectedFeatureModifiedAt: string
    actorId: string
    reason: string
    decision: PlacementDecision
    automatic?: boolean
    additionalGuard?: SQL
  },
) {
  const decision = PlacementDecisionSchema.parse(input.decision)
  if (!input.reason.trim() || input.reason.length > 2000 || !input.actorId)
    throw new Error('A decision author and reason are required')
  const proposal = await db
    .select()
    .from(locationAdoptionProposal)
    .where(
      and(
        eq(locationAdoptionProposal.id, input.proposalId),
        eq(locationAdoptionProposal.featureId, input.featureId),
        eq(locationAdoptionProposal.projectId, input.projectId),
      ),
    )
    .get()
  const retained = proposal?.evidence.placement
  if (!proposal || !retained || proposal.locationDecision)
    return { status: 'conflict' as const }
  const assessed = await assessLocationPlacement(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    ...(retained.kind === 'relocation'
      ? { occupancyRevisionId: retained.occupancyRevisionId! }
      : { addressRevisionId: retained.addressRevisionId ?? undefined }),
  })
  if (!assessed) return { status: 'conflict' as const }
  const {
    parent,
    binding,
    scope,
    settings,
    layerSettings,
    placement,
    canonical,
    oldAddress,
  } = assessed
  if (
    binding.version !== input.expectedRevision ||
    parent.modifiedAt !== input.expectedFeatureModifiedAt ||
    proposal.associationRevision !== binding.version ||
    proposal.featureModifiedAt !== parent.modifiedAt ||
    proposal.layerId !== parent.layerId ||
    proposal.policyRevision !== settings.revision ||
    proposal.layerPolicyRevision !== layerSettings.revision ||
    !equalLocationValue(retained, placement)
  )
    return { status: 'conflict' as const }
  if (decision.action === 'later') return { status: 'deferred' as const }
  const guard = sql`(${input.additionalGuard ?? sql`1`}) AND (${input.automatic ? sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND COALESCE(json_extract(addressMeta,'$.address.association.mode'),'')!='manual')` : sql`1`}) AND EXISTS(SELECT 1 FROM feature f JOIN featureLocation b ON b.featureId=f.id JOIN project p ON p.id=f.projectId JOIN layer l ON l.id=f.layerId WHERE f.id=${parent.id} AND f.projectId=${input.projectId} AND f.layerId=${parent.layerId} AND f.modifiedAt=${parent.modifiedAt} AND f.isDraft=0 AND b.version=${binding.version} AND p.organisationId=${scope} AND p.locationPolicyRevision=${settings.revision} AND l.projectId=p.id AND l.relocationPolicyRevision=${layerSettings.revision}) AND ${headsGuard(placement.relationshipHeads, scope)} AND ${relationshipSignature(placement.relationshipSnapshot.locationIds, scope)}=${placement.relationshipSnapshot.signature} AND COALESCE((SELECT revision FROM organisationLocationHead WHERE organisationId=${scope} AND locationId=${binding.locationId}),'')=${placement.organisationRevision ?? ''} AND NOT EXISTS(SELECT 1 FROM locationAdoptionProposal d WHERE d.featureId=${parent.id} AND d.projectId=${input.projectId} AND d.locationId=${binding.locationId} AND d.occupancyRevisionId IS ${placement.occupancyRevisionId} AND d.addressRevisionId IS ${placement.addressRevisionId} AND d.locationDecision IS NOT NULL)`
  const receipt = {
    id: crypto.randomUUID(),
    proposalId: proposal.id,
    fieldGroup: 'location' as const,
    action: 'rejected' as const,
    actorId: input.actorId,
    reason: input.reason.trim(),
    associationRevision: binding.version,
    createdAt: new Date().toISOString(),
  }
  if (decision.action === 'keep') {
    const saved = await db
      .update(locationAdoptionProposal)
      .set({ locationDecision: receipt })
      .where(and(eq(locationAdoptionProposal.id, proposal.id), guard))
      .returning({ id: locationAdoptionProposal.id })
    return saved.length
      ? { status: 'rejected' as const }
      : { status: 'conflict' as const }
  }
  if (!canonical)
    return {
      status: 'review' as const,
      reason: 'Record a canonical destination address before accepting this move.',
    }
  const hard = placement.blockers.filter(
    b =>
      !['access-directions', 'local-placement'].includes(b) &&
      !(b === 'missing-destination-pin' && !input.automatic && decision.geometry),
  )
  if (
    hard.length ||
    (placement.kind === 'relocation' && placement.policy === 'fixed') ||
    (input.automatic &&
      (placement.policy !== 'follow' ||
        placement.blockers.length ||
        Object.keys(
          reconcileAddressFields(
            placement.beforeOverrides,
            placement.content ?? createLocalLocationAddress(),
          ),
        ).length))
  )
    return {
      status: 'review' as const,
      reason:
        'Placement requires review: ' + [...hard, ...placement.blockers].join(', '),
    }
  if (
    placement.kind === 'relocation' &&
    ((Object.values(placement.beforeAccessHints).some(Boolean) &&
      !decision.directions) ||
      (placement.blockers.includes('local-placement') &&
        (!decision.addressChoice ||
          (!decision.useDestinationPin && !decision.geometry))))
  )
    return {
      status: 'review' as const,
      reason:
        'Choose how to handle local address details, the pin and access directions.',
    }
  if (
    placement.kind === 'relocation' &&
    oldAddress.unitDetails &&
    !decision.unitDetails
  )
    return {
      status: 'review' as const,
      reason: 'Confirm whether to keep or clear the floor and unit details.',
    }
  if (
    !input.automatic &&
    Object.keys(placement.beforeOverrides).length &&
    !decision.addressChoice
  )
    return {
      status: 'review' as const,
      reason:
        'Choose whether to accept the canonical address or reassert your corrections.',
    }
  const fields =
    decision.addressChoice === 'keep'
      ? reconcileAddressFields(
          placement.beforeOverrides,
          placement.content ?? createLocalLocationAddress(),
        )
      : {}
  const overrides = { ...binding.overrides }
  if (Object.keys(fields).length)
    overrides.address = { baseAddressRevisionId: canonical.id, fields }
  else delete overrides.address
  if (placement.kind === 'relocation') delete overrides.location
  const hints =
    decision.directions === 'clear'
      ? {}
      : decision.directions === 'replace'
        ? (decision.accessHints ?? {})
        : placement.beforeAccessHints
  const newGeometry = (decision.geometry ?? placement.geometry) as Point
  const nextAddress = FeatureAddressSchema.parse({
    ...oldAddress,
    canonical: {
      addressId: canonical.addressId,
      revisionId: canonical.id,
      content: placement.content!,
    },
    coordinates: placement.kind === 'relocation' ? null : oldAddress.coordinates,
    overrides: fields,
    accessHints: hints,
    ...(placement.kind === 'relocation'
      ? {
          source: emptyFeatureAddress().source,
          unitDetails:
            decision.unitDetails === 'keep' ? oldAddress.unitDetails : undefined,
          divisionOverrides: undefined,
        }
      : {}),
  })
  const revision = crypto.randomUUID()
  // Author shared address corrections only for same-address reconciliation, never as a side effect of a move.
  const correction =
    placement.kind === 'address'
      ? await prepareOrganisationLocationWrite(db, {
          organisationId: scope,
          locationId: binding.locationId,
          actorId: input.actorId,
          overrides: { ...assessed.correction?.overrides, address: overrides.address },
          provenance: {
            process: 'canonical-address-review',
            proposalId: proposal.id,
            choice: decision.addressChoice ?? 'accept',
          },
          guard,
        })
      : null
  const association = prepareFeatureLocationAssociationWrite(db, {
    featureId: parent.id,
    projectId: input.projectId,
    expectedFeatureModifiedAt: parent.modifiedAt,
    expectedRevision: binding.version,
    locationId: binding.locationId,
    factsRevisionId: binding.factsRevisionId,
    locationRevisionId: binding.locationRevisionId,
    overrides,
    actorId: input.actorId,
    occupancyRevisionId: placement.occupancyRevisionId,
    addressRevisionId: canonical.id,
    membershipRevisionIds: placement.membershipRevisionIds,
    placementOverrides: { accessHints: hints },
    acceptedGeometry: newGeometry,
    acceptancePolicy: {
      projectId: input.projectId,
      layerId: parent.layerId,
      projectVersion: settings.revision,
      layerVersion: layerSettings.revision,
      relocation: placement.policy,
    },
    acceptanceProposalId: proposal.id,
    ...(correction ? { locationOrganisationRevision: correction.revision } : {}),
    additionalGuard: correction
      ? and(
          input.additionalGuard,
          sql`EXISTS(SELECT 1 FROM locationAdoptionProposal WHERE id=${proposal.id} AND locationDecision IS NULL) AND EXISTS(SELECT 1 FROM feature f JOIN project p ON p.id=f.projectId JOIN layer l ON l.id=f.layerId WHERE f.id=${parent.id} AND f.layerId=${parent.layerId} AND p.locationPolicyRevision=${settings.revision} AND l.relocationPolicyRevision=${layerSettings.revision} AND l.projectId=p.id)`,
          correction.guard,
          headsGuard(placement.relationshipHeads, scope),
          sql`${relationshipSignature(placement.relationshipSnapshot.locationIds, scope)}=${placement.relationshipSnapshot.signature}`,
        )
      : guard,
  })
  const applied = sql`EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${parent.id} AND version=${association.version})`
  const modifiedAt = new Date(
    Math.max(Date.now(), (Date.parse(parent.modifiedAt) || 0) + 1),
  ).toISOString()
  const queries: BatchItem<'sqlite'>[] = [
    ...(correction?.queries ?? []),
    association.query,
    db
      .update(feature)
      .set({
        geometry: newGeometry,
        spatialIndex: createFeatureSpatialIndex(newGeometry),
        addressMeta: { ...parent.addressMeta, address: nextAddress },
        modifiedAt,
      })
      .where(and(eq(feature.id, parent.id), applied)),
  ]
  // Locale address projections are updated without changing titles, descriptions or other translations.
  for (const [locale] of Object.entries(ADDRESS_LOCALES))
    queries.push(
      db
        .update(featureI18n)
        .set({
          displayAddress: getAddressDisplay(
            nextAddress,
            locale as keyof typeof ADDRESS_LOCALES,
            [],
            undefined,
            newGeometry.coordinates,
          ),
        })
        .where(
          and(
            eq(featureI18n.featureId, parent.id),
            eq(featureI18n.locale, locale as keyof typeof ADDRESS_LOCALES),
            applied,
          ),
        ),
    )
  queries.push(
    db
      .update(locationAdoptionProposal)
      .set({
        locationDecision: {
          ...receipt,
          id: revision,
          action: 'applied',
          associationRevision: association.version,
        },
      })
      .where(and(eq(locationAdoptionProposal.id, proposal.id), applied)),
  )
  // Capture placement, accepted relationship pins and trigger-built memberships with the decision.
  const capture = await prepareFeatureAcceptedCapture(db, {
    featureId: parent.id,
    actorId: input.actorId,
    guard,
    origin: input.automatic ? 'system' : 'user',
    reason: `Location placement ${proposal.id}: ${input.reason.trim()}`,
    derive: async previous => {
      const content = structuredClone(previous)
      const accepted = content.placement.location
      if (!accepted || accepted.associationVersion !== binding.version)
        throw new Error('Accepted Feature Location changed')
      content.placement.geometry = newGeometry
      // Persisted JSON omits optional undefined address fields exactly as the domain writer does.
      content.placement.addressMeta = JSON.parse(
        JSON.stringify({ ...parent.addressMeta, address: nextAddress }),
      )
      Object.assign(accepted, {
        associationVersion: association.version,
        acceptedOverrides: overrides,
        occupancyRevisionId: placement.occupancyRevisionId,
        addressRevisionId: canonical.id,
        membershipRevisionIds: placement.membershipRevisionIds,
        placementOverrides: { accessHints: hints },
        acceptedGeometry: newGeometry,
        acceptanceProposalId: proposal.id,
        acceptancePolicy: {
          ...accepted.acceptancePolicy,
          projectId: input.projectId,
          layerId: parent.layerId,
          projectVersion: settings.revision,
          layerVersion: layerSettings.revision,
          relocation: placement.policy,
        },
        ...(correction ? { locationOrganisationRevision: correction.revision } : {}),
      })
      accepted.memberships = await readFeatureLocationRevisionMemberships(db, accepted)
      for (const locale of Object.keys(ADDRESS_LOCALES)) {
        if (content.translations[locale])
          content.translations[locale].address.value = getAddressDisplay(
            nextAddress,
            locale as keyof typeof ADDRESS_LOCALES,
            [],
            undefined,
            newGeometry.coordinates,
          )
      }
      return content
    },
  })
  if (
    !(await executeRevisionBatch(db, guard, [
      ...capture.before,
      ...queries,
      ...capture.after,
    ]))
  )
    return { status: 'conflict' as const }
  const saved = await db
    .select({ revision: featureLocation.version })
    .from(featureLocation)
    .where(
      and(
        eq(featureLocation.featureId, parent.id),
        eq(featureLocation.version, association.version),
      ),
    )
    .get()
  return saved
    ? {
        status: 'applied' as const,
        revision: association.version,
        modifiedAt,
        geometryChanged: !equalLocationValue(parent.geometry, newGeometry),
      }
    : { status: 'conflict' as const }
}

/** Scan a bounded page of affected associations; retries reuse proposals and durable decisions.
 * @param db Request database. @param input Relationship subject or canonical address target and cursor.
 * @returns Continuation cursor and counts; caller resumes until nextCursor is null.
 */
export async function reconcileLocationPlacements(
  db: Database,
  input: {
    locationId?: string
    addressRevisionId?: string
    afterFeatureId?: string
    actorId: string
    scopeOrganisationId?: string | null
  },
) {
  const rows = await db.all<{ featureId: string; projectId: string }>(
    sql`SELECT f.id featureId,f.projectId FROM feature f JOIN featureLocation b ON b.featureId=f.id JOIN project p ON p.id=f.projectId WHERE f.isDraft=0 AND f.id>${input.afterFeatureId ?? ''} AND (${input.locationId ? sql`b.locationId=${input.locationId}` : sql`b.addressRevisionId IN(SELECT old.id FROM addressRevision old JOIN addressRevision target ON target.addressId=old.addressId WHERE target.id=${input.addressRevisionId ?? ''})`}) AND (${input.scopeOrganisationId ? sql`p.organisationId=${input.scopeOrganisationId}` : sql`1`}) ORDER BY f.id LIMIT 21`,
  )
  const movedFeatureIds: string[] = []
  let proposed = 0,
    applied = 0
  for (const row of rows.slice(0, 20)) {
    let targets: Target[] = [{ ...row, addressRevisionId: input.addressRevisionId }]
    if (input.locationId) {
      const scope = await db.get<{ organisationId: string }>(
        sql`SELECT organisationId FROM project WHERE id=${row.projectId}`,
      )
      if (!scope) continue
      const heads = await db.all<{ id: string }>(
        sql`SELECT r.id FROM locationOccupancyHead r WHERE ${canonicalLocationSQL(sql`r.establishmentLocationId`)}=${input.locationId} AND r.assertionState='asserted' AND r.occupancyState IN ('current','unconfirmed') AND ${relationshipScopeSql('locationOccupancy', scope.organisationId)} ORDER BY r.recordedAt DESC,r.id LIMIT 2`,
      )
      targets = heads.map(head => ({ ...row, occupancyRevisionId: head.id }))
    }
    for (const target of targets) {
      const proposal = await proposeLocationPlacement(db, target)
      if (!proposal || proposal.locationDecision) continue
      proposed++
      if (proposal.evidence.plan.decision.location === 'adopt') {
        const result = await decideLocationPlacement(db, {
          ...row,
          proposalId: proposal.id,
          expectedRevision: proposal.associationRevision,
          expectedFeatureModifiedAt: proposal.featureModifiedAt,
          actorId: input.actorId,
          reason: 'Follow verified placement under current Project/Layer policy',
          decision: { action: 'move' },
          automatic: true,
        })
        if (result.status === 'applied') {
          applied++
          if (result.geometryChanged) movedFeatureIds.push(row.featureId)
        }
      }
    }
  }
  return {
    proposed,
    applied,
    movedFeatureIds,
    nextCursor: rows.length > 20 ? rows[19].featureId : null,
  }
}
