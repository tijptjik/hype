// DRIZZLE
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { place, placeRevision } from '../schema/place'
import { featureProperty, featurePropertyI18n } from '../schema/feature'
import { property } from '../schema/property'
import { hub } from '../schema/hub'
// DOMAIN
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// OWNERSHIP
import { placeOwnerForProject } from './placeScope'
// TYPES
import type { PlaceFacts } from '#lib/places/model.js'
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ACCEPTED SOURCE READS
// 2. ATOMIC PHONE MATERIALIZATION
// ---

/**
 * Read the two accepted source snapshots after checking the Place's project scope.
 * @param db Request-local database.
 * @param input Persisted association identities and authorized project scope.
 * @returns Accepted sources, or undefined if unavailable; never substitutes a newer revision.
 */
export async function readPlaceResetSources(
  db: Database,
  input: {
    placeId: string
    projectId: string
    factsRevisionId: string
    locationRevisionId: string
  },
): Promise<{ facts: PlaceFacts; locationFacts: PlaceFacts } | undefined> {
  const location = alias(placeRevision, 'resetLocation')
  return db
    .select({ facts: placeRevision.facts, locationFacts: location.facts })
    .from(place)
    .innerJoin(
      placeRevision,
      and(
        eq(placeRevision.placeId, place.id),
        eq(placeRevision.id, input.factsRevisionId),
      ),
    )
    .innerJoin(
      location,
      and(eq(location.placeId, place.id), eq(location.id, input.locationRevisionId)),
    )
    .where(
      and(
        eq(place.id, input.placeId),
        or(
          isNull(place.ownerOrganisationId),
          eq(place.ownerOrganisationId, placeOwnerForProject(input.projectId)),
        ),
      ),
    )
    .get()
}

/**
 * Prepare a targeted phone reset without replacing any unrelated property or translation.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param revision New association token guarding every statement.
 * @param phones Accepted source array, validated without dropping or reordering values.
 * @returns Guarded statements for the same association/Feature transaction.
 * @remarks Preserves source spelling so inherited and materialized arrays are equal.
 */
export async function preparePlacePhoneReset(
  db: Database,
  featureId: string,
  revision: string,
  phones: string[],
): Promise<BatchItem<'sqlite'>[]> {
  if (phones.some(phone => !normalizeHongKongPhoneNumber(phone)))
    throw new Error('Accepted Place contains an invalid Hong Kong phone number')
  const definitions = await db
    .select({ id: property.id })
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
    throw new Error('Universal phone property is unavailable or ambiguous')
  const propertyId = definitions[0].id
  const guard = sql`EXISTS (SELECT 1 FROM featurePlace WHERE featureId=${featureId} AND revision=${revision})`
  // Delete before insert avoids dialect-dependent INSERT SELECT upsert parsing.
  return [
    db
      .delete(featurePropertyI18n)
      .where(
        and(
          eq(featurePropertyI18n.featureId, featureId),
          eq(featurePropertyI18n.propertyId, propertyId),
          guard,
        ),
      ),
    db
      .delete(featureProperty)
      .where(
        and(
          eq(featureProperty.featureId, featureId),
          eq(featureProperty.propertyId, propertyId),
          guard,
        ),
      ),
    db
      .insert(featureProperty)
      .select(
        sql`SELECT ${featureId},${propertyId},NULL,${JSON.stringify(phones)},NULL WHERE ${guard}`,
      ),
  ]
}
