// DRIZZLE
import { and, eq, isNull, ne, or } from 'drizzle-orm'
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
// TYPES
import type { Database } from '#lib/types.js'
import type { InitialLocationLinkResult } from './locationLink'

/**
 * Reassociate an existing Feature without changing its effective values or explicit corrections.
 * @param db Request-local database.
 * @param input Authorized project, selected destination and both persisted concurrency tokens.
 * @returns New association revision, or a non-mutating conflict/unavailable/review result.
 * @remarks This changes one Feature's interpretation, not the old Location identity or other
 * Features. It is not ssId churn reconciliation. Existing explicit overrides/clears survive
 * even when equal to the new source. Database triggers retain the previous association and actor.
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
  },
): Promise<InitialLocationLinkResult> {
  const current = await getAcceptedFeatureLocation(db, input.featureId, input.projectId)
  if (!current || current.revision !== input.expectedRevision)
    return { status: 'conflict' }
  const association = await db
    .select({ overrides: featureLocation.overrides })
    .from(featureLocation)
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(featureLocation.revision, input.expectedRevision),
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
          isNull(locationTable.ownerOrganisationId),
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
  const overrides = preserveFeatureLocationBaseline(
    current.effective,
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
  const write = prepareFeatureLocationAssociationWrite(db, {
    ...input,
    factsRevisionId: input.revisionId,
    locationRevisionId: input.revisionId,
    overrides,
  })
  const rows = await write.query
  return rows.length
    ? { status: 'linked', revision: write.revision }
    : { status: 'conflict' }
}
