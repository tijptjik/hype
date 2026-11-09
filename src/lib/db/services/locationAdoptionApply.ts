import { readSharedLocationCorrection, sharedLocationFacts } from './locationShared'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
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
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { readFeatureLocationRevisionMemberships } from './featureLocationRevision'
import {
  parseFeatureRevisionSource,
  buildFeatureRevisionBaselineContent,
} from './featureRevisionContent'
import { contentMapToStorage } from '#lib/i18n/contentRecords.js'
import { property, propertyI18n } from '../schema/property'
import { hub } from '../schema/hub'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
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
  if (proposal.evidence.placement)
    return {
      status: 'review',
      reason: 'Use the placement review decisions for this candidate',
    }
  // A review accepts the shared evidence it displayed, never a later correction.
  const sharedHead = await readSharedLocationCorrection(db, proposal.locationId)
  if ((sharedHead?.id ?? null) !== (proposal.evidence.sharedRevision ?? null))
    return { status: 'conflict' }
  const current = await db
    .select()
    .from(featureLocation)
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(featureLocation.locationId, proposal.locationId),
        eq(featureLocation.version, input.expectedRevision),
      ),
    )
    .get()
  if (!current) return { status: 'conflict' }
  if (
    input.fieldGroup === 'location' &&
    (current.occupancyRevisionId || current.addressRevisionId)
  )
    return {
      status: 'review',
      reason:
        'Review the accepted occupancy/address placement before changing its position',
    }
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
  const shared = await sharedLocationFacts(
    db,
    current.locationId,
    candidate.facts,
    proposal.evidence.sharedRevision ?? null,
  )
  candidate.facts = shared.facts
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
      'websites',
      'socials',
      'accessibility',
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
  const sharedStorage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='locationSharedRevision' AND type='table'`,
  )
  const sharedFence = sharedStorage?.n
    ? sql`(SELECT id FROM locationSharedHead WHERE locationId=${current.locationId}) IS ${proposal.evidence.sharedRevision ?? null}`
    : sql`1`
  const proposalGuard = sql`(${sharedFence}) AND EXISTS (
    SELECT 1 FROM locationAdoptionProposal ap JOIN location p ON p.id=ap.locationId
    WHERE ap.id=${proposal.id} AND p.sourceAvailability='current' AND p.ssId IS ${candidate.ssId}
      AND (p.state!='manual' OR p.ownerOrganisationId=${locationOwnerForProject(input.projectId)})
      AND ap.rowid=(SELECT MAX(newer.rowid) FROM locationAdoptionProposal newer
        WHERE newer.featureId=ap.featureId AND newer.projectId=ap.projectId
          AND newer.locationId=ap.locationId AND newer.candidateRevisionId=ap.candidateRevisionId AND newer.organisationRevision=ap.organisationRevision AND json_extract(newer.evidence,'$.sharedRevision') IS json_extract(ap.evidence,'$.sharedRevision') AND json_extract(newer.evidence,'$.placement') IS NULL)
      AND ((ap.associationRevision=${input.expectedRevision} AND ap.featureModifiedAt=${input.expectedFeatureModifiedAt})
        OR EXISTS (SELECT 1 FROM json_each(json_array(json(ap.factsDecision),json(ap.locationDecision))) prior
          WHERE json_extract(prior.value,'$.action')='applied' AND json_extract(prior.value,'$.associationRevision')=${input.expectedRevision}))
      AND NOT EXISTS (SELECT 1 FROM locationAdoptionProposal older
        WHERE older.featureId=ap.featureId AND older.projectId=ap.projectId
          AND older.locationId=ap.locationId AND older.candidateRevisionId=ap.candidateRevisionId AND older.organisationRevision=ap.organisationRevision AND json_extract(older.evidence,'$.sharedRevision') IS json_extract(ap.evidence,'$.sharedRevision') AND json_extract(older.evidence,'$.placement') IS NULL
          AND (CASE WHEN ${input.fieldGroup}='facts' THEN older.factsDecision ELSE older.locationDecision END) IS NOT NULL)
      AND (${Number(input.mode !== 'automatic')} OR
        COALESCE((SELECT locationPolicyRevision FROM project WHERE id=ap.projectId),0)=ap.policyRevision)
  )`
  const association = prepareFeatureLocationAssociationWrite(db, {
    ...input,
    expectedFeatureModifiedAt: input.expectedFeatureModifiedAt,
    locationId: current.locationId,
    overrides: nextOverrides,
    ...(shared.revision
      ? {
          acceptancePolicy:
            input.fieldGroup === 'facts'
              ? {
                  factsSharedRevision: shared.revision,
                  lastSharedRevision: shared.revision,
                  factsSharedFields: [],
                }
              : { locationSharedRevision: shared.revision },
        }
      : {}),
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
    ...(materialized.data.geometry?.type === 'Point'
      ? { acceptedGeometry: materialized.data.geometry }
      : {}),
    additionalGuard: and(
      proposalGuard,
      input.additionalGuard,
      sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND COALESCE(json_extract(addressMeta,'$.address.association.mode'),'')!='manual')`,
    ),
  })
  const guard = sql`EXISTS (SELECT 1 FROM featureLocation WHERE featureId=${input.featureId} AND version=${association.version})`
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
        association.version,
        materialized.phones,
      )
  } catch (error) {
    return {
      status: 'review',
      reason: error instanceof Error ? error.message : 'Invalid phones',
    }
  }
  // A final decision failure rolls back the association, projections and routing jobs.
  const capture = await prepareFeatureAcceptedCapture(db, {
    revisionBoundary: true,
    featureId: input.featureId,
    actorId: input.actorId,
    origin: input.mode === 'automatic' ? 'system' : 'user',
    reason: `Location adoption ${proposal.id} (${input.fieldGroup}, ${input.mode}): ${input.reason.trim()}`,
    guard: and(proposalGuard, input.additionalGuard)!,
    derive: async (previous, captured) => {
      const next = parseFeatureRevisionSource(captured.snapshot)
      next.record.geometry = z.json().parse(geometry)
      if (input.fieldGroup === 'location')
        next.record.addressMeta = z.json().parse(materialized.data.addressMeta ?? {})
      const link = next.location[0]
      if (!link || link.version !== input.expectedRevision)
        throw new Error('Feature association changed')
      Object.assign(link, {
        acceptancePolicy: shared.revision
          ? {
              ...current.acceptancePolicy,
              ...(input.fieldGroup === 'facts'
                ? {
                    factsSharedRevision: shared.revision,
                    lastSharedRevision: shared.revision,
                    factsSharedFields: [],
                  }
                : { locationSharedRevision: shared.revision }),
            }
          : current.acceptancePolicy,
        version: association.version,
        actorId: input.actorId,
        overrides: nextOverrides,
        factsRevisionId:
          input.fieldGroup === 'facts' ? candidate.id : current.factsRevisionId,
        locationRevisionId:
          input.fieldGroup === 'location' ? candidate.id : current.locationRevisionId,
        factsOrganisationRevision:
          input.fieldGroup === 'facts' && proposal.organisationRevision
            ? proposal.organisationRevision
            : current.factsOrganisationRevision,
        locationOrganisationRevision:
          input.fieldGroup === 'location' && proposal.organisationRevision
            ? proposal.organisationRevision
            : current.locationOrganisationRevision,
        acceptedGeometry:
          geometry.type === 'Point' ? geometry : current.acceptedGeometry,
        acceptanceProposalId: null,
      })
      for (const [locale, value] of Object.entries(
        contentMapToStorage(materialized.i18n),
      )) {
        let row = next.translations.find(row => row.locale === locale)
        const independent = current.acceptancePolicy?.nameMode === 'independent'
        if (!row) {
          row = {
            featureId: input.featureId,
            locale,
            title: '',
            titleGen: true,
            description: null,
            descriptionGen: true,
            displayAddress: null,
            displayAddressGen: true,
            addressProperties: null,
          }
          next.translations.push(row)
        }
        for (const key of [
          'title',
          'titleGen',
          'description',
          'descriptionGen',
          'displayAddress',
          'displayAddressGen',
          'addressProperties',
        ] as const) {
          if (independent && (key === 'title' || key === 'titleGen')) continue
          if (value[key] !== undefined) row[key] = value[key] as never
        }
      }
      if (materialized.phones !== undefined) {
        const definitions = await db
          .select({ definition: property })
          .from(property)
          .innerJoin(hub, eq(hub.id, property.hubId))
          .where(
            and(
              eq(property.key, 'phoneNumber'),
              eq(property.scope, 'hub'),
              eq(hub.code, 'core'),
            ),
          )
        if (definitions.length !== 1)
          throw new Error('Universal phone property changed')
        const definition = definitions[0].definition
        if (!next.fieldDefinitions.some(row => row.id === definition.id)) {
          next.fieldDefinitions.push(definition as never)
          next.fieldTranslations.push(
            ...(await db
              .select()
              .from(propertyI18n)
              .where(eq(propertyI18n.propertyId, definition.id))),
          )
        }
        next.properties = next.properties.filter(
          row => row.propertyId !== definition.id,
        )
        next.properties.push({
          featureId: input.featureId,
          propertyId: definition.id,
          propertyValueId: null,
          value: JSON.stringify(materialized.phones),
          valueJson: null,
        })
        next.propertyTranslations = next.propertyTranslations.filter(
          row => row.propertyId !== definition.id,
        )
      }
      const content = buildFeatureRevisionBaselineContent(next, {
        revisions: Object.fromEntries(
          Object.entries(previous.gallery.entries).map(([id, entry]) => [
            id,
            entry.imageRevisionId,
          ]),
        ),
        order: previous.gallery.order,
      })
      // Location adoption does not alter gallery captions, ordering or image-version selection.
      content.gallery = previous.gallery
      if (content.placement.location)
        content.placement.location.memberships =
          await readFeatureLocationRevisionMemberships(db, content.placement.location)
      return content
    },
  })
  const result = await db.batch([
    ...capture.before,
    association.query,
    parent,
    ...prepareFeatureLocationRelations(
      db,
      input.featureId,
      association.version,
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
          associationRevision: association.version,
          createdAt: new Date().toISOString(),
        },
      })
      .where(and(eq(locationAdoptionProposal.id, proposal.id), guard)),
    ...capture.after,
  ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  const saved = (result[capture.before.length + 1] as FeatureDB[])[0]
  return saved
    ? {
        status: 'applied',
        feature: saved,
        revision: association.version,
        geometryChanged,
      }
    : { status: 'conflict' }
}
