// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// SERVICES
import { assertFeatureIntentLocation } from './featureIntentPolicy'
import { readFeatureLocationBaseline } from './locationBaseline'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
import { prepareFeatureLocationAssociationCapture } from './featureLocationAssociationRevision'
import { prepareLinkedLocationProjection } from './locationLinkProjection'
import {
  readSharedLocationCorrection,
  sharedLocationFacts,
  prepareSharedLocationCorrection,
} from './locationShared'
import { prepareStaffLocationPropagation } from './locationStaffPropagation'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'

/** Adopt a reviewed shared Hype Location and retain only a missing phone as shared curation.
 * @param db Request database. @param input Authorized Feature and exact source/association pins.
 * @returns Saved association and optional curation revision, or null for stale evidence.
 * @remarks Publisher snapshots stay immutable. Phone curation, propagation, Feature history and
 * association are one transaction; custom Feature names remain Feature-owned. Local drafts
 * keep an otherwise missing phone as a Feature override without editing the shared draft.
 */
export async function acceptReconciliationLocation(
  db: Database,
  input: {
    featureId: string
    projectId: string
    locationId: string
    revisionId: string
    expectedSourceHash?: string
    expectedFeatureModifiedAt: string
    expectedRevision: string | null
    actorId: string
    scopeGuard: SQL
    authorizePhoneCuration: () => Promise<{
      organisationId: string
      rights: { canEdit: boolean; superAdmin: boolean }
    }>
  },
): Promise<{ revision: string; curationRevision: string | null } | null> {
  await assertFeatureIntentLocation(db, input.featureId, input.locationId)
  const baseline = await readFeatureLocationBaseline(
    db,
    input.featureId,
    input.projectId,
    undefined,
    'explicit',
  )
  if (
    baseline.status !== 'ready' ||
    baseline.baseline.modifiedAt !== input.expectedFeatureModifiedAt
  )
    return null
  const source = await db.get<{ facts: string; state: string }>(sql`
    SELECT r.facts,l.state FROM locationRevisionContent r JOIN location l ON l.id=r.locationId
    WHERE r.id=${input.revisionId} AND l.id=${input.locationId} AND ((l.state='linked' AND l.ssId IS NOT NULL) OR (l.state='unresolved' AND l.ssId IS NULL)) AND l.ownerOrganisationId IS NULL AND l.sourceAvailability='current'
      AND (l.state='linked' OR r.contentHash=${input.expectedSourceHash ?? null})
      AND r.id=(SELECT id FROM locationRevisionContent WHERE locationId=l.id ORDER BY version DESC LIMIT 1)
  `)
  if (!source) return null
  const upstream = readLocationFacts(source.facts)
  const head = await readSharedLocationCorrection(db, input.locationId)
  const shared = await sharedLocationFacts(
    db,
    input.locationId,
    upstream,
    head?.id ?? null,
  )
  const fence = sql`(${input.scopeGuard})
    AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND projectId=${input.projectId}
      AND modifiedAt=${input.expectedFeatureModifiedAt} AND isArchived=0 AND isDraft=0)
    AND (SELECT version FROM featureLocation WHERE featureId=${input.featureId}) IS ${input.expectedRevision}
    AND NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${input.featureId} AND locationId=${input.locationId})
    AND EXISTS(SELECT 1 FROM location WHERE id=${input.locationId} AND ((state='linked' AND ssId IS NOT NULL) OR (state='unresolved' AND ssId IS NULL)) AND ownerOrganisationId IS NULL AND sourceAvailability='current')
    AND (SELECT id FROM locationRevisionContent WHERE locationId=${input.locationId} ORDER BY version DESC LIMIT 1)=${input.revisionId}
    AND EXISTS(SELECT 1 FROM location l JOIN locationRevisionContent r ON r.locationId=l.id WHERE l.id=${input.locationId} AND r.id=${input.revisionId} AND (l.state='linked' OR r.contentHash=${input.expectedSourceHash ?? null}))
    AND (SELECT id FROM locationSharedHead WHERE locationId=${input.locationId}) IS ${head?.id ?? null}`
  const current = await db.get<{ valid: number }>(
    sql`SELECT CASE WHEN ${fence} THEN 1 ELSE 0 END valid`,
  )
  if (!current?.valid) return null
  let curation: Awaited<ReturnType<typeof prepareSharedLocationCorrection>> | null =
    null
  let propagation: Awaited<ReturnType<typeof prepareStaffLocationPropagation>> | null =
    null
  const phoneChoice = head ? JSON.parse(head.corrections).phoneNumber : undefined
  // Linking a draft does not grant permission to edit its shared working copy.
  const overrides: FeatureLocationOverrides =
    source.state === 'unresolved' &&
    !shared.facts.phoneNumber?.length &&
    baseline.baseline.effective.phoneNumber?.length
      ? {
          phoneNumber: {
            mode: 'override',
            value: baseline.baseline.effective.phoneNumber,
          },
        }
      : {}
  // Existing community edits, including explicit clears, take precedence over imported fallback evidence.
  if (
    source.state === 'linked' &&
    !upstream.phoneNumber?.length &&
    !shared.facts.phoneNumber?.length &&
    (!phoneChoice ||
      phoneChoice.choice?.mode === 'inherit' ||
      phoneChoice.supersededBy) &&
    baseline.baseline.effective.phoneNumber?.length
  ) {
    const author = await input.authorizePhoneCuration()
    curation = await prepareSharedLocationCorrection(db, {
      locationId: input.locationId,
      sourceRevisionId: input.revisionId,
      expectedRevision: head?.id ?? null,
      actorId: input.actorId,
      guard: fence,
      rights: author.rights,
      patch: {
        phoneNumber: {
          mode: 'override',
          value: baseline.baseline.effective.phoneNumber,
        },
      },
      provenance: {
        kind: 'reconciliation-phone',
        featureId: input.featureId,
        authorOrganisationId: author.organisationId,
      },
    })
    propagation = await prepareStaffLocationPropagation(db, {
      locationId: input.locationId,
      sourceRevisionId: input.revisionId,
      sharedRevisionId: curation.id,
      actorId: input.actorId,
      facts: curation.facts,
      fields: ['phoneNumber'],
    })
  }
  const revision = curation?.id ?? head?.id ?? null
  const facts = curation?.facts ?? shared.facts
  // Adopt the shared source without seeding old names, addresses or other values into Organisation corrections.
  const write = prepareFeatureLocationAssociationWrite(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    locationId: input.locationId,
    expectedFeatureModifiedAt: input.expectedFeatureModifiedAt,
    expectedRevision: input.expectedRevision,
    actorId: input.actorId,
    factsRevisionId: input.revisionId,
    locationRevisionId: input.revisionId,
    overrides,
    factsOrganisationRevision: null,
    locationOrganisationRevision: null,
    acceptancePolicy: {
      nameMode: 'inherit',
      locationMode: 'inherit',
      factsSharedRevision: revision,
      locationSharedRevision: revision,
      lastSharedRevision: revision,
      factsSharedFields: [],
    },
    additionalGuard: input.scopeGuard,
  })
  const projection = await prepareLinkedLocationProjection(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    revision: write.version,
    facts,
    overrides,
  })
  const capture = await prepareFeatureLocationAssociationCapture(db, {
    association: write.input,
    version: write.version,
    projection: projection.projection,
    guard: fence,
    preparedSharedCorrections: curation
      ? [
          {
            id: curation.id,
            locationId: input.locationId,
            corrections: curation.corrections,
          },
        ]
      : [],
  })
  const saved = await executeRevisionBatch(
    db,
    sql`(${fence}) AND (${curation?.guard ?? sql`1`}) AND (${propagation?.guard ?? sql`1`})`,
    [
      ...capture.before,
      ...(curation?.queries ?? []),
      ...(propagation?.statements ?? []),
      write.query,
      ...projection.queries,
      ...capture.after,
    ],
  )
  return saved
    ? { revision: write.version, curationRevision: curation?.id ?? null }
    : null
}
