// ═══════════════════════
// TABLE OF CONTENTS
// 1. REVIEW INPUT AND FIELD GROUPS
// 2. ORGANISATION-WIDE GUARDED DECISIONS
// ---
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// DOMAIN
import { equalLocationValue } from '#lib/locations/baseline.js'
import { CURATION_IDENTITY_FIELDS } from '#lib/locations/curationIdentity.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// SCHEMA
import { locationAdoptionProposal } from '../schema/location'
import { feature as featureTable } from '../schema/feature'
// SERVICES
import { readLocationAdoptionReview } from './locationAdoptionReview'
import { previewFeatureLocationAdoption } from './locationAdoption'
import { readSharedLocationCorrection, sharedLocationFacts } from './locationShared'
import { prepareSharedFeatureAdoption } from './locationSharedFeature'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { readCurrentFeatureRevision } from './featureLifecycle'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
import type { LocationAdoptionApplyResult } from './locationAdoptionApply'

/** Existing review groups remain atomic until the grouped policy migration is applied. */
const factFields = [
  'names',
  'brands',
  ...CURATION_IDENTITY_FIELDS,
  'phoneNumber',
  'websites',
  'socials',
  'accessibility',
  'footprint',
  'operatingStatus',
  'buildingStatus',
  'successorLocationId',
] as const

export type OrganisationAdoptionInput = {
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
}

/** Accept or retain a reviewed Location value for every consumer in its Organisation.
 * @param db Request-local database.
 * @param input Authorized initiating review and exact displayed revision tokens.
 * @param keepCurrent Retain the initiating consumer's visible values as Organisation customizations.
 * @returns One atomic decision and updated initiating Feature, or a non-mutating conflict/review result.
 * @remarks The association set, source, community head, Organisation head, and policy are fenced.
 * Independent Feature titles and manual/occupancy placements remain Feature-owned.
 */
export async function applyOrganisationLocationAdoption(
  db: Database,
  input: OrganisationAdoptionInput,
  keepCurrent = false,
): Promise<LocationAdoptionApplyResult> {
  const review = await readLocationAdoptionReview(db, input)
  if (!review || review.decisions.some(row => row.fieldGroup === input.fieldGroup))
    return { status: 'conflict' }
  const proposal = review.proposal
  if (proposal.evidence.placement)
    return { status: 'review', reason: 'Use the placement review for this candidate' }
  const preview = await previewFeatureLocationAdoption(db, {
    ...input,
    candidateRevisionId: proposal.candidateRevisionId,
    organisationRevision: proposal.organisationRevision || undefined,
  })
  if (
    !preview ||
    preview.expectedRevision !== input.expectedRevision ||
    preview.expectedFeatureModifiedAt !== input.expectedFeatureModifiedAt
  )
    return { status: 'conflict' }
  if (
    !keepCurrent &&
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
    (keepCurrent ||
      preview.settings.revision !== proposal.policyRevision ||
      JSON.stringify(preview.settings.policy) !==
        JSON.stringify(proposal.evidence.policy) ||
      preview.plan.decision[input.fieldGroup] !== 'adopt' ||
      proposal.evidence.plan.decision[input.fieldGroup] !== 'adopt')
  )
    return {
      status: 'review',
      reason: 'Policy requires review or changed after assessment',
    }
  const owner = await db.get<{ organisationId: string }>(
    sql`SELECT organisationId FROM project WHERE id=${input.projectId}`,
  )
  if (!owner) return { status: 'conflict' }
  const organisationId = owner.organisationId
  const source = await db.get<{ facts: string }>(
    sql`SELECT facts FROM locationRevision WHERE id=${proposal.candidateRevisionId} AND locationId=${proposal.locationId}`,
  )
  const shared = await readSharedLocationCorrection(db, proposal.locationId)
  if (!source || (shared?.id ?? null) !== (proposal.evidence.sharedRevision ?? null))
    return { status: 'conflict' }
  const candidate = (
    await sharedLocationFacts(
      db,
      proposal.locationId,
      readLocationFacts(source.facts),
      shared?.id ?? null,
    )
  ).facts
  const initiating = await readCurrentFeatureRevision(db, {
    featureId: input.featureId,
    guard: sql`1`,
  })
  const initiatingBinding = initiating?.content.placement.location
  if (
    !initiatingBinding ||
    initiatingBinding.associationVersion !== input.expectedRevision
  )
    return { status: 'conflict' }
  const current = await readOrganisationLocation(
    db,
    organisationId,
    proposal.locationId,
  )
  // A new Organisation edit must never be released by a decision based on older displayed customizations.
  const displayedOrganisationRevision =
    proposal.organisationRevision ||
    (input.fieldGroup === 'facts'
      ? initiatingBinding.factsOrganisationRevision
      : initiatingBinding.locationOrganisationRevision) ||
    null
  if ((current?.revision ?? null) !== displayedOrganisationRevision)
    return { status: 'conflict' }
  const subjects = sql`SELECT f.id,f.projectId,f.modifiedAt,b.version,p.locationPolicy,p.locationPolicyRevision,o.settings AS organisationSettings FROM feature f JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId JOIN featureLocation b ON b.featureId=f.id WHERE p.organisationId=${organisationId} AND b.locationId=${proposal.locationId} AND f.isDraft=0 ORDER BY f.id`
  const consumers = await db.all<{
    id: string
    projectId: string
    modifiedAt: string
    version: string
    locationPolicy: string | null
    locationPolicyRevision: number
    organisationSettings: string
  }>(subjects)
  if (!consumers.some(row => row.id === input.featureId)) return { status: 'conflict' }
  const signature = JSON.stringify(
    consumers.map(row => [
      row.id,
      row.projectId,
      row.modifiedAt,
      row.version,
      row.locationPolicy,
      row.locationPolicyRevision,
      row.organisationSettings,
    ]),
  )
  const headFence = current
    ? sql`(SELECT revision FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${proposal.locationId})=${current.revision}`
    : sql`NOT EXISTS(SELECT 1 FROM organisationLocationHead WHERE organisationId=${organisationId} AND locationId=${proposal.locationId})`
  const guard = sql`(${input.additionalGuard ?? sql`1`}) AND (${headFence})
    AND (SELECT json_group_array(json_array(id,projectId,modifiedAt,version,locationPolicy,locationPolicyRevision,organisationSettings)) FROM (${subjects}))=${signature}
    AND (SELECT id FROM locationSharedHead WHERE locationId=${proposal.locationId}) IS ${shared?.id ?? null}
    AND (SELECT organisationId FROM project WHERE id=${input.projectId})=${organisationId}
    AND EXISTS(SELECT 1 FROM location WHERE id=${proposal.locationId} AND sourceAvailability='current' AND state!='redirect' AND (state!='manual' OR ownerOrganisationId=${organisationId}))
    AND EXISTS(SELECT 1 FROM locationAdoptionProposal WHERE id=${proposal.id} AND ${input.fieldGroup === 'facts' ? sql`factsDecision` : sql`locationDecision`} IS NULL)
    AND (SELECT id FROM locationRevision WHERE locationId=${proposal.locationId} ORDER BY version DESC LIMIT 1)=${proposal.candidateRevisionId}`
  const fields = input.fieldGroup === 'facts' ? [...factFields] : ['location']
  const overrides: FeatureLocationOverrides = structuredClone(current?.overrides ?? {})
  for (const field of fields) {
    const before =
      field === 'location'
        ? preview.plan.source.beforeLocation
        : preview.plan.source.beforeFacts[field as keyof typeof candidate]
    if (equalLocationValue(before, candidate[field as keyof typeof candidate])) continue
    delete (overrides as Record<string, unknown>)[field]
    if (overrides.freshness) delete overrides.freshness[field]
  }
  if (keepCurrent) {
    const before = preview.plan.before
    for (const field of fields) {
      const oldValue = before[field as keyof typeof before]
      const value =
        oldValue === undefined &&
        candidate[field as keyof typeof candidate] !== undefined
          ? null
          : oldValue
      if (field === 'names')
        overrides.names = Object.fromEntries(
          [
            ...new Set([...Object.keys(before.names), ...Object.keys(candidate.names)]),
          ].map(locale => [
            locale,
            before.names[locale] == null
              ? { mode: 'clear' }
              : { mode: 'override', value: before.names[locale] },
          ]),
        )
      else if (value !== undefined)
        Object.assign(overrides, {
          [field]:
            value === null &&
            !['operatingStatus', 'buildingStatus', 'successorLocationId'].includes(
              field,
            )
              ? { mode: 'clear' }
              : { mode: 'override', value },
        })
    }
  }
  const authored = await prepareOrganisationLocationWrite(db, {
    organisationId,
    locationId: proposal.locationId,
    actorId: input.actorId,
    overrides,
    guard,
    provenance: {
      kind: keepCurrent ? 'location-keep-current' : 'location-acceptance',
      proposalId: proposal.id,
      fields,
    },
  })
  const statements: BatchItem<'sqlite'>[] = [...authored.queries]
  for (const consumer of consumers) {
    const prepared = await prepareSharedFeatureAdoption(db, {
      featureId: consumer.id,
      projectId: consumer.projectId,
      actorId: input.actorId,
      action: keepCurrent ? 'values-retained' : 'contribution-accepted',
      origin: input.mode === 'automatic' ? 'system' : 'user',
      locationId: proposal.locationId,
      sharedRevisionId: shared?.id ?? null,
      sourceRevisionId: proposal.candidateRevisionId,
      facts: candidate,
      fields,
      includeLocation: input.fieldGroup === 'location',
      acceptSourceFacts: input.fieldGroup === 'facts',
      organisation: { revision: authored.revision, overrides },
      guard: sql`EXISTS(SELECT 1 FROM feature f JOIN featureLocation b ON b.featureId=f.id WHERE f.id=${consumer.id} AND f.projectId=${consumer.projectId} AND f.modifiedAt=${consumer.modifiedAt} AND b.locationId=${proposal.locationId} AND b.version=${consumer.version})`,
    })
    if (!prepared) return { status: 'conflict' }
    statements.push(prepareRevisionCheck(db, prepared.guard), ...prepared.statements)
  }
  // Keep every retained proposal immutable; only pending matching decisions receive this Organisation receipt.
  statements.push(
    db
      .update(locationAdoptionProposal)
      .set({
        [input.fieldGroup === 'facts' ? 'factsDecision' : 'locationDecision']:
          sql`json_object(
    'id',${crypto.randomUUID()},'proposalId',id,'fieldGroup',${input.fieldGroup},'action',${keepCurrent ? 'rejected' : 'applied'},'actorId',${input.actorId},'reason',${input.reason},'associationRevision',(SELECT version FROM featureLocation WHERE featureId=locationAdoptionProposal.featureId),'createdAt',${new Date().toISOString()})`,
      })
      .where(sql`locationId=${proposal.locationId} AND candidateRevisionId=${proposal.candidateRevisionId}
    AND json_extract(evidence,'$.sharedRevision') IS ${shared?.id ?? null}
    AND ${input.fieldGroup === 'facts' ? sql`factsDecision` : sql`locationDecision`} IS NULL
    AND featureId IN (SELECT f.id FROM feature f JOIN project p ON p.id=f.projectId WHERE p.organisationId=${organisationId})`),
  )
  if (!(await executeRevisionBatch(db, guard, statements)))
    return { status: 'conflict' }
  const feature = await db
    .select()
    .from(featureTable)
    .where(eq(featureTable.id, input.featureId))
    .get()
  const accepted = await readCurrentFeatureRevision(db, {
    featureId: input.featureId,
    guard: sql`1`,
  })
  if (!feature || !accepted?.content.placement.location)
    throw new Error('Accepted Location projection unavailable')
  return {
    status: 'applied',
    feature: { ...feature, addressMeta: feature.addressMeta ?? {} },
    revision: accepted.content.placement.location.associationVersion,
    geometryChanged: !equalLocationValue(
      initiating.content.placement.geometry,
      feature.geometry,
    ),
  }
}
