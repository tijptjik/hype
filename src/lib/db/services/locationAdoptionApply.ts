// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature, featureI18n } from '../schema/feature'
import {
  featureLocation,
  locationRevision,
  locationAdoptionProposal,
} from '../schema/location'
// DOMAIN
import { materializeLocationAdoption } from '#lib/locations/adoptionMaterialize.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { readLocationAdoptionReview } from './locationAdoptionReview'
import { previewFeatureLocationAdoption } from './locationAdoption'
import { readLocationResetSources, prepareLocationPhoneReset } from './locationReset'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
import { prepareFeatureLocationRelations } from './locationRelations'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureDB } from '#lib/db/zod/schema/feature.types.js'

export type LocationAdoptionApplyResult =
  | {
      status: 'applied'
      revision: string
      feature: FeatureDB
      geometryChanged: boolean
    }
  | { status: 'conflict' }
  | { status: 'review'; reason: string }

/**
 * Adopt one source group and materialize its Feature projection in one transaction.
 * @param db Request-local database.
 * @param input Authorized scope, current editor tokens, immutable proposal and decision mode.
 * @returns Updated Feature or non-mutating conflict/review result.
 * @remarks Caller authorizes inherited fields. Automatic calls require unchanged policy
 * and an adopt decision. Reviewed calls may accept policy review, never missing evidence.
 * Trusted worker callers may add a lease/run guard to the atomic write.
 * Geometry triggers enqueue routing in the same transaction.
 */
export async function applyLocationAdoptionGroup(
  db: Database,
  input: {
    featureId: string
    projectId: string
    proposalId: string
    fieldGroup: 'facts' | 'location'
    mode: 'automatic' | 'reviewed'
    expectedRevision: string
    expectedFeatureModifiedAt: string
    actorId: string
    reason: string
    additionalGuard?: SQL
  },
): Promise<LocationAdoptionApplyResult> {
  if (
    !input.actorId ||
    !input.reason.trim() ||
    input.reason.trim().length > 2000 ||
    !['facts', 'location'].includes(input.fieldGroup) ||
    !['automatic', 'reviewed'].includes(input.mode)
  )
    throw new Error('Invalid Location adoption decision')
  const review = await readLocationAdoptionReview(db, input)
  if (!review || review.decisions.some(row => row.fieldGroup === input.fieldGroup))
    return { status: 'conflict' }
  const proposal = review.proposal
  const current = await db
    .select()
    .from(featureLocation)
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(featureLocation.locationId, proposal.locationId),
        eq(featureLocation.revision, input.expectedRevision),
      ),
    )
    .get()
  if (!current) return { status: 'conflict' }
  const preview = await previewFeatureLocationAdoption(db, {
    ...input,
    candidateRevisionId: proposal.candidateRevisionId,
    organisationRevision: proposal.organisationRevision,
  })
  if (
    !preview ||
    preview.expectedRevision !== input.expectedRevision ||
    preview.expectedFeatureModifiedAt !== input.expectedFeatureModifiedAt
  )
    return { status: 'conflict' }
  if (
    preview.plan.blockers.some(
      blocker =>
        blocker !== 'lifecycle-review' &&
        (input.fieldGroup === 'location' || blocker !== 'address-dependencies'),
    )
  )
    return {
      status: 'review',
      reason: 'Source evidence or dependencies are incomplete',
    }
  if (
    input.mode === 'automatic' &&
    (preview.settings.revision !== proposal.policyRevision ||
      proposal.evidence.plan.decision[input.fieldGroup] !== 'adopt' ||
      preview.plan.decision[input.fieldGroup] !== 'adopt')
  )
    return {
      status: 'review',
      reason: 'Project policy requires review or changed after assessment',
    }
  const sources = await readLocationResetSources(db, {
    ...current,
    projectId: input.projectId,
  })
  const candidate = await db
    .select()
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.id, proposal.candidateRevisionId),
        eq(locationRevision.locationId, proposal.locationId),
      ),
    )
    .get()
  const parentBefore = await db
    .select()
    .from(feature)
    .where(
      and(
        eq(feature.id, input.featureId),
        eq(feature.projectId, input.projectId),
        eq(feature.modifiedAt, input.expectedFeatureModifiedAt),
      ),
    )
    .get()
  if (!sources || !candidate || !parentBefore) return { status: 'conflict' }
  const translations = await db
    .select()
    .from(featureI18n)
    .where(eq(featureI18n.featureId, input.featureId))
  const proposedOverrides = proposal.evidence.candidateOverrides ?? current.overrides
  const nextOverrides = { ...current.overrides }
  if (input.fieldGroup === 'facts') {
    for (const key of [
      'footprint',
      'names',
      'phoneNumber',
      'brands',
      'operatingStatus',
      'buildingStatus',
      'successorLocationId',
    ] as const) {
      delete nextOverrides[key]
      if (proposedOverrides[key] !== undefined)
        Object.assign(nextOverrides, { [key]: proposedOverrides[key] })
    }
  } else {
    delete nextOverrides.location
    if (proposedOverrides.location !== undefined)
      nextOverrides.location = proposedOverrides.location
  }
  let materialized: ReturnType<typeof materializeLocationAdoption>
  try {
    materialized = (
      proposal.organisationRevision
        ? materializeEffectiveLocation
        : materializeLocationAdoption
    )({
      fieldGroup: input.fieldGroup,
      facts: input.fieldGroup === 'facts' ? candidate.facts : sources.facts,
      locationFacts:
        input.fieldGroup === 'location' ? candidate.facts : sources.locationFacts,
      overrides: nextOverrides,
      data: {
        geometry: parentBefore.geometry,
        addressMeta: parentBefore.addressMeta ?? {},
      },
      i18n: Object.fromEntries(translations.map(row => [row.locale, row])),
    })
  } catch (error) {
    return {
      status: 'review',
      reason: error instanceof Error ? error.message : 'Invalid source values',
    }
  }
  // A pending group may follow the other group's application, never an unrelated edit.
  const proposalGuard = sql`EXISTS (
    SELECT 1 FROM locationAdoptionProposal ap JOIN location p ON p.id=ap.locationId
    WHERE ap.id=${proposal.id} AND p.sourceAvailability='current' AND p.ssId IS ${candidate.ssId}
      AND (p.state!='manual' OR p.ownerOrganisationId=${locationOwnerForProject(input.projectId)})
      AND ap.rowid=(SELECT MAX(newer.rowid) FROM locationAdoptionProposal newer
        WHERE newer.featureId=ap.featureId AND newer.projectId=ap.projectId
          AND newer.locationId=ap.locationId AND newer.candidateRevisionId=ap.candidateRevisionId AND newer.organisationRevision=ap.organisationRevision)
      AND ((ap.associationRevision=${input.expectedRevision} AND ap.featureModifiedAt=${input.expectedFeatureModifiedAt})
        OR EXISTS (SELECT 1 FROM json_each(json_array(json(ap.factsDecision),json(ap.locationDecision))) prior
          WHERE json_extract(prior.value,'$.action')='applied' AND json_extract(prior.value,'$.associationRevision')=${input.expectedRevision}))
      AND NOT EXISTS (SELECT 1 FROM locationAdoptionProposal older
        WHERE older.featureId=ap.featureId AND older.projectId=ap.projectId
          AND older.locationId=ap.locationId AND older.candidateRevisionId=ap.candidateRevisionId AND older.organisationRevision=ap.organisationRevision
          AND (CASE WHEN ${input.fieldGroup}='facts' THEN older.factsDecision ELSE older.locationDecision END) IS NOT NULL)
      AND (${Number(input.mode !== 'automatic')} OR
        COALESCE((SELECT locationPolicyRevision FROM project WHERE id=ap.projectId),0)=ap.policyRevision)
  )`
  const association = prepareFeatureLocationAssociationWrite(db, {
    ...input,
    expectedFeatureModifiedAt: input.expectedFeatureModifiedAt,
    locationId: current.locationId,
    overrides: nextOverrides,
    factsOrganisationRevision:
      input.fieldGroup === 'facts' && proposal.organisationRevision
        ? proposal.organisationRevision
        : current.factsOrganisationRevision,
    locationOrganisationRevision:
      input.fieldGroup === 'location' && proposal.organisationRevision
        ? proposal.organisationRevision
        : current.locationOrganisationRevision,
    factsRevisionId:
      input.fieldGroup === 'facts' ? candidate.id : current.factsRevisionId,
    locationRevisionId:
      input.fieldGroup === 'location' ? candidate.id : current.locationRevisionId,
    additionalGuard: and(proposalGuard, input.additionalGuard),
  })
  const guard = sql`EXISTS (SELECT 1 FROM featureLocation WHERE featureId=${input.featureId} AND revision=${association.revision})`
  const geometry = materialized.data.geometry!
  const geometryChanged = !equalLocationValue(geometry, parentBefore.geometry)
  const parent = db
    .update(feature)
    .set({
      modifiedAt: new Date(
        Math.max(Date.now(), (Date.parse(input.expectedFeatureModifiedAt) || 0) + 1),
      ).toISOString(),
      ...(input.fieldGroup === 'location' &&
      !equalLocationValue(materialized.data.addressMeta, parentBefore.addressMeta ?? {})
        ? { addressMeta: materialized.data.addressMeta }
        : {}),
      ...(geometryChanged
        ? { geometry, spatialIndex: createFeatureSpatialIndex(geometry) }
        : {}),
    })
    .where(and(eq(feature.id, input.featureId), guard))
    .returning()
  let phones: Awaited<ReturnType<typeof prepareLocationPhoneReset>> = []
  try {
    if (materialized.phones !== undefined)
      phones = await prepareLocationPhoneReset(
        db,
        input.featureId,
        association.revision,
        materialized.phones,
      )
  } catch (error) {
    return {
      status: 'review',
      reason: error instanceof Error ? error.message : 'Invalid phones',
    }
  }
  // A final decision failure rolls back the association, projections and routing jobs.
  const result = await db.batch([
    association.query,
    parent,
    ...prepareFeatureLocationRelations(
      db,
      input.featureId,
      association.revision,
      materialized.i18n,
    ),
    ...phones,
    db
      .update(locationAdoptionProposal)
      .set({
        [input.fieldGroup === 'facts' ? 'factsDecision' : 'locationDecision']: {
          id: crypto.randomUUID(),
          proposalId: proposal.id,
          fieldGroup: input.fieldGroup,
          action: 'applied',
          actorId: input.actorId,
          reason: input.reason.trim(),
          associationRevision: association.revision,
          createdAt: new Date().toISOString(),
        },
      })
      .where(and(eq(locationAdoptionProposal.id, proposal.id), guard)),
  ])
  const saved = (result[1] as FeatureDB[])[0]
  return saved
    ? {
        status: 'applied',
        feature: saved,
        revision: association.revision,
        geometryChanged,
      }
    : { status: 'conflict' }
}
