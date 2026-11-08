// DRIZZLE
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { feature } from '../schema/feature'
import { location, locationRevision, organisationLocation, featureLocation } from '../schema/location'
import { locationOccupancy, locationMembership } from '../schema/locationRelationships'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { BatchItem } from 'drizzle-orm/batch'

type AcceptedLocation = NonNullable<FeatureRevisionContent['placement']['location']>

// TABLE OF CONTENTS
// 1. Accepted Location transfer preparation
// 2. Atomic association replacement

/**
 * Copies only the Location evidence accepted by a transferring Feature.
 * @param db Request database.
 * @param input Source acceptance, destination organisation and server authorization callback.
 * @returns Prepared evidence writes and the remapped acceptance; no writes execute here.
 * @remarks Shared identities survive. Local owned identities and scoped assertions become
 * independent destination records. Existing destination corrections are never overwritten.
 */
export async function prepareFeatureLocationTransfer(db: Database, input: {
  featureId: string
  sourceOrganisationId: string
  destinationOrganisationId: string
  actorId: string
  accepted: AcceptedLocation
  authorizeDestination?: () => Promise<unknown>
}): Promise<{ accepted: AcceptedLocation; beforeMove: BatchItem<'sqlite'>[]; afterMove: BatchItem<'sqlite'>[] }> {
  const accepted = structuredClone(input.accepted)
  const guards: BatchItem<'sqlite'>[] = [prepareRevisionCheck(db, sql`EXISTS(
    SELECT 1 FROM featureLocation fl JOIN feature f ON f.id=fl.featureId JOIN project p ON p.id=f.projectId
    WHERE fl.featureId=${input.featureId} AND fl.version=${input.accepted.associationVersion}
      AND p.organisationId=${input.sourceOrganisationId})`)]
  const writes: BatchItem<'sqlite'>[] = []
  const identities = new Map<string, string>()
  const revisions = new Map<string, string>()
  const now = new Date().toISOString()
  let authorized = false
  /** Authorize once before preparing any destination-owned evidence.
   * @returns Nothing; unauthorized requests throw before any writes.
   */
  async function authorize(): Promise<void> {
    if (authorized) return
    if (!input.authorizeDestination) throw new Error('Destination organisation management permission is required to copy Location definitions')
    await input.authorizeDestination()
    authorized = true
  }
  /** Describe the accepted source of an independent copy.
   * @param source Immutable source revision.
   * @returns Durable transfer attribution.
   */
  const provenance = (source: string): Record<string, unknown> => ({
    operation: 'feature-organisation-transfer', featureId: input.featureId,
    sourceOrganisationId: input.sourceOrganisationId, sourceRevisionId: source,
    actorId: input.actorId,
  })
  /** Resolve a referenced identity, cloning owned local records with accepted baselines.
   * @param id Referenced Location identity.
   * @returns Destination-accessible identity.
   */
  async function identity(id: string): Promise<string> {
    if (identities.has(id)) return identities.get(id)!
    const row = await db.select().from(location).where(eq(location.id, id)).get()
    if (!row || row.state === 'redirect') throw new Error('Location identity changed; refresh before transferring')
    guards.push(prepareRevisionCheck(db, sql`EXISTS(SELECT 1 FROM location WHERE id=${id} AND state=${row.state} AND ownerOrganisationId IS ${row.ownerOrganisationId})`))
    if (row.state === 'linked' || row.ownerOrganisationId === input.destinationOrganisationId ||
        (row.state !== 'manual' && row.ownerOrganisationId !== input.sourceOrganisationId)) {
      identities.set(id, id)
      return id
    }
    if (row.ownerOrganisationId !== input.sourceOrganisationId) throw new Error('Accepted Location belongs to another organisation')
    await authorize()
    const next = nanoid(12)
    identities.set(id, next)
    writes.push(db.insert(location).values({ ...row, id: next, ownerOrganisationId: input.destinationOrganisationId, createdAt: now }))
    // Primary snapshots are exact accepted pins; containers have no accepted baseline pin.
    const pinned = id === input.accepted.locationId
      ? [...new Set([input.accepted.factsRevisionId, input.accepted.locationRevisionId])]
      : [(await db.select().from(locationRevision).where(eq(locationRevision.locationId, id)).orderBy(sql`${locationRevision.version} DESC`).get())?.id].filter((value): value is string => Boolean(value))
    if (!pinned.length) throw new Error('Accepted Location baseline is unavailable')
    for (const pin of pinned) {
      const snapshot = await db.select().from(locationRevision).where(eq(locationRevision.id, pin)).get()
      if (!snapshot || snapshot.locationId !== id) throw new Error('Accepted Location baseline is unavailable')
      const revisionId = nanoid(12)
      revisions.set(pin, revisionId)
      const facts = structuredClone(snapshot.facts)
      if (facts.successorLocationId) facts.successorLocationId = await identity(facts.successorLocationId)
      const rawSource = { ...snapshot.rawSource, transfer: provenance(pin) }
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rawSource)))
      const contentHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      writes.push(db.insert(locationRevision).values({ ...snapshot, id: revisionId, locationId: next,
        origin: 'local', facts: sql`${serializeLocationFacts(facts, row.kind)}`, rawSource, contentHash, createdAt: now }))
    }
    return next
  }
  /** Remap organisation-owned successor references without changing their meaning.
   * @param value Accepted correction snapshot.
   * @returns Validated corrections with destination-accessible references.
   */
  async function overrides(value: unknown): Promise<typeof organisationLocation.$inferSelect.overrides> {
    const result = FeatureLocationOverridesSchema.parse(value)
    if (result.successorLocationId?.mode === 'override' && result.successorLocationId.value)
      result.successorLocationId.value = await identity(result.successorLocationId.value)
    return result
  }
  accepted.locationId = await identity(accepted.locationId)
  accepted.factsRevisionId = revisions.get(accepted.factsRevisionId) ?? accepted.factsRevisionId
  accepted.locationRevisionId = revisions.get(accepted.locationRevisionId) ?? accepted.locationRevisionId

  accepted.acceptedOverrides = FeatureRevisionContentSchema.shape.placement.shape.location.unwrap().shape.acceptedOverrides.parse(await overrides(accepted.acceptedOverrides))

  // Copy exact accepted correction pins, not the source organisation's newer unaccepted head.
  const correctionPins = [...new Set([accepted.factsOrganisationRevision, accepted.locationOrganisationRevision].filter((id): id is string => Boolean(id)))]
  const correctionMap = new Map<string, string>()
  if (correctionPins.length) {
    await authorize()
    const existing = await db.select().from(organisationLocation).where(sql`${organisationLocation.organisationId}=${input.destinationOrganisationId} AND ${organisationLocation.locationId}=${accepted.locationId}`)
    const head = existing.find(row => !existing.some(other => other.previousRevisionId === row.revision))
    guards.push(prepareRevisionCheck(db, head
      ? sql`EXISTS(SELECT 1 FROM organisationLocationHead WHERE organisationId=${input.destinationOrganisationId} AND locationId=${accepted.locationId} AND revision=${head.revision})`
      : sql`NOT EXISTS(SELECT 1 FROM organisationLocation WHERE organisationId=${input.destinationOrganisationId} AND locationId=${accepted.locationId})`))
    let previousRevisionId: string | null = null
    for (const pin of correctionPins) {
      const source = await db.select().from(organisationLocation).where(eq(organisationLocation.revision, pin)).get()
      if (!source || source.organisationId !== input.sourceOrganisationId || source.locationId !== input.accepted.locationId)
        throw new Error('Accepted organisation Location definition is unavailable')
      const copiedOverrides = await overrides(source.overrides)
      if (head) {
        // Reuse only the current equivalent definition, never adopt conflicting destination conventions.
        if (!equalLocationValue(head.overrides, copiedOverrides))
          throw new Error('The destination organisation already has a conflicting Location definition')
        correctionMap.set(pin, head.revision)
      } else {
        const revision = nanoid(12)
        correctionMap.set(pin, revision)
        writes.push(db.insert(organisationLocation).values({ ...source, revision,
          organisationId: input.destinationOrganisationId, locationId: accepted.locationId,
          previousRevisionId, overrides: copiedOverrides, provenance: { ...source.provenance, ...provenance(pin) }, actorId: input.actorId, createdAt: now }))
        previousRevisionId = revision
      }
    }
  }
  accepted.factsOrganisationRevision = accepted.factsOrganisationRevision ? correctionMap.get(accepted.factsOrganisationRevision)! : null
  accepted.locationOrganisationRevision = accepted.locationOrganisationRevision ? correctionMap.get(accepted.locationOrganisationRevision)! : null

  /** Reuse equivalent destination placement evidence and fence conflicting assertions.
   * @param table Fixed internal assertion table.
   * @param subjectColumn Fixed subject column in that table.
   * @param subject Destination-accessible subject Location.
   * @param expected Placement meaning, excluding evidence attribution and revision identity.
   * @returns Existing equivalent assertion ID, or null when a new root is needed.
   */
  async function destinationAssertion(
    table: 'locationOccupancy' | 'locationMembership',
    subjectColumn: 'establishmentLocationId' | 'childLocationId',
    subject: string,
    expected: Record<string, unknown>,
  ): Promise<string | null> {
    const heads = sql`SELECT a.* FROM ${sql.identifier(table)} a
      WHERE a.${sql.identifier(subjectColumn)}=${subject} AND a.scopeOrganisationId=${input.destinationOrganisationId}
      AND NOT EXISTS(SELECT 1 FROM ${sql.identifier(table)} n WHERE n.previousRevisionId=a.id) ORDER BY a.id`
    const rows = await db.all<Record<string, unknown>>(heads)
    guards.push(prepareRevisionCheck(db, sql`(SELECT json_group_array(id) FROM (${heads}))=${JSON.stringify(rows.map(row => row.id))}`))
    if (!rows.length) return null
    const equivalent = rows.find(row => Object.entries(expected).every(([key, value]) => equalLocationValue(row[key], value)))
    if (!equivalent) throw new Error('The destination organisation already has conflicting Location placement evidence')
    return String(equivalent.id)
  }
  // Scope accepted occupancy/membership assertions independently, retaining shared address revisions.
  const assertions = new Map<string, string>()
  if (accepted.occupancyRevisionId) {
    const row = await db.select().from(locationOccupancy).where(eq(locationOccupancy.id, accepted.occupancyRevisionId)).get()
    if (!row) throw new Error('Accepted occupancy is unavailable')
    const establishmentLocationId = await identity(row.establishmentLocationId)
    const containerLocationId = row.containerLocationId ? await identity(row.containerLocationId) : null
    if (row.scopeOrganisationId || establishmentLocationId !== row.establishmentLocationId || containerLocationId !== row.containerLocationId) {
      if (row.scopeOrganisationId && row.scopeOrganisationId !== input.sourceOrganisationId) throw new Error('Accepted occupancy scope changed')
      await authorize()
      const existing = await destinationAssertion('locationOccupancy', 'establishmentLocationId', establishmentLocationId, {
        establishmentLocationId, containerLocationId, addressRevisionId: row.addressRevisionId,
        assertionState: row.assertionState, occupancyState: row.occupancyState,
        effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
        effectiveFromPrecision: row.effectiveFromPrecision, effectiveToPrecision: row.effectiveToPrecision,
      })
      const id = existing ?? nanoid(12)
      assertions.set(row.id, id)
      if (!existing) writes.push(db.insert(locationOccupancy).values({ ...row, id, relationshipId: id, previousRevisionId: null,
        scopeOrganisationId: input.destinationOrganisationId, establishmentLocationId, containerLocationId,
        provenance: { ...row.provenance, ...provenance(row.id) }, actorId: input.actorId, recordedAt: now }))
      accepted.occupancyRevisionId = id
    }
  }
  const membershipParents = new Map<string, string>()
  for (const pin of accepted.membershipRevisionIds) {
    const row = await db.select().from(locationMembership).where(eq(locationMembership.id, pin)).get()
    if (!row) throw new Error('Accepted membership is unavailable')
    const childLocationId = await identity(row.childLocationId), parentLocationId = await identity(row.parentLocationId)
    membershipParents.set(pin, parentLocationId)
    if (row.scopeOrganisationId || childLocationId !== row.childLocationId || parentLocationId !== row.parentLocationId) {
      if (row.scopeOrganisationId && row.scopeOrganisationId !== input.sourceOrganisationId) throw new Error('Accepted membership scope changed')
      await authorize()
      const existing = await destinationAssertion('locationMembership', 'childLocationId', childLocationId, {
        childLocationId, parentLocationId, assertionState: row.assertionState, membershipState: row.membershipState,
        effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
        effectiveFromPrecision: row.effectiveFromPrecision, effectiveToPrecision: row.effectiveToPrecision,
      })
      const id = existing ?? nanoid(12)
      assertions.set(pin, id)
      if (!existing) writes.push(db.insert(locationMembership).values({ ...row, id, relationshipId: id, previousRevisionId: null,
        scopeOrganisationId: input.destinationOrganisationId, childLocationId, parentLocationId,
        provenance: { ...row.provenance, ...provenance(pin) }, actorId: input.actorId, recordedAt: now }))
    }
  }
  const groupedMembership = new Map<string, string>()
  for (const [pin, parent] of membershipParents) {
    const mapped = assertions.get(pin) ?? pin
    if (!groupedMembership.has(parent) || mapped < groupedMembership.get(parent)!) groupedMembership.set(parent, mapped)
  }
  accepted.membershipRevisionIds = accepted.membershipRevisionIds.map(id => assertions.get(id) ?? id)
  accepted.associationVersion = nanoid(12)
  accepted.memberships = accepted.memberships.map(row => ({ ...row,
    containerLocationId: identities.get(row.containerLocationId) ?? row.containerLocationId,
    bindingVersion: accepted.associationVersion,
    occupancyRevisionId: row.occupancyRevisionId ? assertions.get(row.occupancyRevisionId) ?? row.occupancyRevisionId : null,
    membershipRevisionId: row.membershipRevisionId ? groupedMembership.get(identities.get(row.containerLocationId) ?? row.containerLocationId) ?? assertions.get(row.membershipRevisionId) ?? row.membershipRevisionId : null,
  }))
  // Detach only inside the atomic batch so namespace guards see valid associations on both sides.
  return { accepted, beforeMove: [...guards, ...writes,
    db.update(feature).set({ modifiedAt: sql`modifiedAt`, localLocationBrands: sql`json_object('actorId',${input.actorId},'sourceAssociationRevision',${input.accepted.associationVersion})` }).where(eq(feature.id, input.featureId)),
    db.delete(featureLocation).where(eq(featureLocation.featureId, input.featureId)),
  ], afterMove: [db.insert(featureLocation).values({
    featureId: input.featureId, locationId: accepted.locationId, version: accepted.associationVersion,
    actorId: input.actorId, factsRevisionId: accepted.factsRevisionId, locationRevisionId: accepted.locationRevisionId,
    overrides: accepted.acceptedOverrides, factsOrganisationRevision: accepted.factsOrganisationRevision,
    locationOrganisationRevision: accepted.locationOrganisationRevision, occupancyRevisionId: accepted.occupancyRevisionId,
    addressRevisionId: accepted.addressRevisionId, membershipRevisionIds: accepted.membershipRevisionIds,
    placementOverrides: accepted.placementOverrides, acceptedGeometry: accepted.acceptedGeometry as typeof featureLocation.$inferInsert.acceptedGeometry,
    acceptancePolicy: accepted.acceptancePolicy, acceptanceProposalId: accepted.acceptanceProposalId,
  })] }
}
