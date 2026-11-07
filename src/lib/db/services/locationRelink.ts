// DRIZZLE
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureLocation,
  location as locationTable,
  locationRevision,
} from '../schema/location'
// DOMAIN
import { preserveFeatureLocationBaseline } from '#lib/locations/baseline.js'
import {
  LocationFactsSchema,
  FeatureLocationOverridesSchema,
} from '#lib/locations/validation.js'
// SERVICES
import { getAcceptedFeatureLocation } from './location'
import { readFeatureLocationBaseline } from './locationBaseline'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from './organisationLocation'
import { readProjectLocationOwner } from './locationScope'
import { prepareLinkedLocationProjection } from './locationLinkProjection'
import { prepareFeatureLocationAssociationCapture } from './featureLocationAssociationRevision'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { InitialLocationLinkResult } from './locationLink'

/**
 * Reassociate a Feature, preserving its editable values while adopting the new physical footprint.
 * @param db Request-local database.
 * @param input Authorized project, selected destination and both persisted concurrency tokens.
 * @returns New association revision, or a non-mutating conflict/unavailable/review result.
 * @remarks This changes one Feature's interpretation, not the old Location identity or other
 * Features. It is not ssId churn reconciliation. Existing explicit overrides/clears survive
 * even when equal to the new source, except the footprint of the old physical entity.
 * Database triggers retain the previous association and actor.
 */
export async function relinkFeatureLocation(
  db: Database,
  input: {
    featureId: string
    projectId: string
    locationId: string
    revisionId: string
    expectedFeatureModifiedAt: string
    expectedRevision: string
    actorId: string
    nameMode?: 'inherit' | 'independent'
    authorizeLocationCorrection?: () => Promise<void>
  },
): Promise<InitialLocationLinkResult> {
  const current = await getAcceptedFeatureLocation(db, input.featureId, input.projectId)
  if (!current || current.version !== input.expectedRevision)
    return { status: 'conflict' }
  const association = await db
    .select({ overrides: featureLocation.overrides })
    .from(featureLocation)
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(featureLocation.version, input.expectedRevision),
      ),
    )
    .get()
  if (!association) return { status: 'conflict' }
  const previousOverrides = FeatureLocationOverridesSchema.parse(association.overrides)
  const baseline = await readFeatureLocationBaseline(
    db,
    input.featureId,
    input.projectId,
    undefined,
    'linked',
  )
  if (baseline.status !== 'ready') return baseline
  if (baseline.baseline.modifiedAt !== input.expectedFeatureModifiedAt)
    return { status: 'conflict' }
  // Destination scope is checked before any canonical or private facts are returned.
  const destination = await db
    .select({ facts: locationRevision.facts })
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationTable.id, input.locationId),
        ne(locationTable.state, 'redirect'),
        eq(locationRevision.id, input.revisionId),
        eq(locationTable.sourceAvailability, 'current'),
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(
            locationTable.ownerOrganisationId,
            locationOwnerForProject(input.projectId),
          ),
        ),
      ),
    )
    .get()
  if (!destination) return { status: 'place-unavailable' }
  const facts = LocationFactsSchema.parse(destination.facts)
  let overrides = preserveFeatureLocationBaseline(
    // Lifecycle describes the selected entity; reassociation cannot copy the old entity's closure.
    {
      ...current.effective,
      // A footprint describes the old physical entity, never its replacement.
      footprint: undefined,
      operatingStatus: undefined,
      buildingStatus: undefined,
      successorLocationId: undefined,
    },
    facts,
    facts.location,
  )
  // Reassociation is not a reset: explicit user choices remain explicit across sources.
  for (const [locale, override] of Object.entries(previousOverrides.names ?? {})) {
    if (override.mode !== 'inherit') {
      overrides.names ??= {}
      overrides.names[locale] = override
    }
  }
  for (const key of ['phoneNumber', 'brands', 'location'] as const) {
    const override = previousOverrides[key]
    if (override && override.mode !== 'inherit')
      Object.assign(overrides, { [key]: override })
  }
  const organisationId = await readProjectLocationOwner(db, input.projectId)
  const corrections = await readOrganisationLocation(
    db,
    organisationId,
    input.locationId,
  )
  const independentPlacement = Boolean(baseline.baseline.address.association)
  if (independentPlacement) delete overrides.location
  if (input.nameMode && !corrections) delete overrides.names
  if (corrections) overrides = corrections.overrides
  if (!corrections && Object.keys(overrides).length)
    await input.authorizeLocationCorrection?.()
  // Seed preserved values once at Organisation scope; subsequent Features reuse that head.
  const fence = sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND projectId=${input.projectId} AND modifiedAt=${input.expectedFeatureModifiedAt}) AND EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${input.featureId} AND version=${input.expectedRevision})`
  const correction = await prepareOrganisationLocationWrite(db, {
    organisationId,
    locationId: input.locationId,
    actorId: input.actorId,
    overrides,
    guard: fence,
  })
  const write = prepareFeatureLocationAssociationWrite(db, {
    ...input,
    ...(independentPlacement
      ? {
          acceptancePolicy: {
            nameMode: input.nameMode ?? current.nameMode ?? 'independent',
            locationMode: 'independent',
          },
          acceptedGeometry: baseline.baseline.address.coordinates
            ? {
                type: 'Point' as const,
                coordinates: baseline.baseline.address.coordinates,
              }
            : undefined,
        }
      : {}),
    ...(!independentPlacement && (input.nameMode ?? current.nameMode)
      ? { acceptancePolicy: { nameMode: input.nameMode ?? current.nameMode } }
      : {}),
    factsRevisionId: input.revisionId,
    locationRevisionId: input.revisionId,
    overrides,
    factsOrganisationRevision: correction.revision,
    locationOrganisationRevision: correction.revision,
    additionalGuard: correction.guard,
  })
  const projections =
    corrections || input.nameMode
      ? await prepareLinkedLocationProjection(db, {
          ...input,
          revision: write.version,
          facts,
          overrides,
        })
      : undefined
  const capture = await prepareFeatureLocationAssociationCapture(db, {
    association: write.input,
    version: write.version,
    projection: projections?.projection,
    guard: fence,
  })
  const results = await executeRevisionBatch(db, fence, [
    ...capture.before,
    ...correction.queries,
    write.query,
    ...(projections?.queries ?? []),
    ...capture.after,
  ])
  const rows = results?.[capture.before.length + correction.queries.length] as
    | Array<{ version: string }>
    | undefined
  return rows?.length
    ? { status: 'linked', revision: write.version }
    : { status: 'conflict' }
}
