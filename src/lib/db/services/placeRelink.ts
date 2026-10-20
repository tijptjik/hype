// DRIZZLE
import { and, eq, isNull, ne, or } from 'drizzle-orm'
// SCHEMA
import { featurePlace, place, placeRevision } from '../schema/place'
// DOMAIN
import { preserveFeaturePlaceBaseline } from '#lib/places/baseline.js'
import {
  PlaceFactsSchema,
  FeaturePlaceOverridesSchema,
} from '#lib/places/validation.js'
// SERVICES
import { getAcceptedFeaturePlace } from './place'
import { readFeaturePlaceBaseline } from './placeBaseline'
import { prepareFeaturePlaceAssociationWrite } from './placeAssociation'
// OWNERSHIP
import { placeOwnerForProject } from './placeScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { InitialPlaceLinkResult } from './placeLink'

/**
 * Reassociate an existing Feature without changing its effective values or explicit corrections.
 * @param db Request-local database.
 * @param input Authorized project, selected destination and both persisted concurrency tokens.
 * @returns New association revision, or a non-mutating conflict/unavailable/review result.
 * @remarks This changes one Feature's interpretation, not the old Place identity or other
 * Features. It is not ssId churn reconciliation. Existing explicit overrides/clears survive
 * even when equal to the new source. Database triggers retain the previous association and actor.
 */
export async function relinkFeaturePlace(
  db: Database,
  input: {
    featureId: string
    projectId: string
    placeId: string
    revisionId: string
    expectedFeatureModifiedAt: string
    expectedRevision: string
    actorId: string
  },
): Promise<InitialPlaceLinkResult> {
  const current = await getAcceptedFeaturePlace(db, input.featureId, input.projectId)
  if (!current || current.revision !== input.expectedRevision)
    return { status: 'conflict' }
  const association = await db
    .select({ overrides: featurePlace.overrides })
    .from(featurePlace)
    .where(
      and(
        eq(featurePlace.featureId, input.featureId),
        eq(featurePlace.revision, input.expectedRevision),
      ),
    )
    .get()
  if (!association) return { status: 'conflict' }
  const previousOverrides = FeaturePlaceOverridesSchema.parse(association.overrides)
  const baseline = await readFeaturePlaceBaseline(
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
    .select({ facts: placeRevision.facts })
    .from(placeRevision)
    .innerJoin(place, eq(place.id, placeRevision.placeId))
    .where(
      and(
        eq(place.id, input.placeId),
        ne(place.state, 'redirect'),
        eq(placeRevision.id, input.revisionId),
        eq(place.sourceAvailability, 'current'),
        or(
          isNull(place.ownerOrganisationId),
          eq(place.ownerOrganisationId, placeOwnerForProject(input.projectId)),
        ),
      ),
    )
    .get()
  if (!destination) return { status: 'place-unavailable' }
  const facts = PlaceFactsSchema.parse(destination.facts)
  const overrides = preserveFeaturePlaceBaseline(
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
  const write = prepareFeaturePlaceAssociationWrite(db, {
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
