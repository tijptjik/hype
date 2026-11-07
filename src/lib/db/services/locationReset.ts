// DRIZZLE
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
import { featureProperty, featurePropertyI18n } from '../schema/feature'
import { property } from '../schema/property'
import { hub } from '../schema/hub'
// DOMAIN
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { LocationFacts } from '#lib/locations/model.js'
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ACCEPTED SOURCE READS
// 2. ATOMIC PHONE MATERIALIZATION
// ---

/**
 * Read the two accepted source snapshots after checking the Location's project scope.
 * @param db Request-local database.
 * @param input Persisted association identities and authorized project scope.
 * @returns Accepted sources, or undefined if unavailable; never substitutes a newer revision.
 */
export async function readLocationResetSources(
  db: Database,
  input: {
    locationId: string
    projectId: string
    factsRevisionId: string
    locationRevisionId: string
  },
): Promise<{ facts: LocationFacts; locationFacts: LocationFacts } | undefined> {
  const location = alias(locationRevision, 'resetLocation')
  return db
    .select({ facts: locationRevision.facts, locationFacts: location.facts })
    .from(locationTable)
    .innerJoin(
      locationRevision,
      and(
        eq(locationRevision.locationId, locationTable.id),
        eq(locationRevision.id, input.factsRevisionId),
      ),
    )
    .innerJoin(
      location,
      and(
        eq(location.locationId, locationTable.id),
        eq(location.id, input.locationRevisionId),
      ),
    )
    .where(
      and(
        eq(locationTable.id, input.locationId),
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
export async function prepareLocationPhoneReset(
  db: Database,
  featureId: string,
  revision: string,
  phones: string[],
): Promise<BatchItem<'sqlite'>[]> {
  if (phones.some(phone => !normalizeHongKongPhoneNumber(phone)))
    throw new Error('Accepted Location contains an invalid Hong Kong phone number')
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
  const guard = sql`EXISTS (SELECT 1 FROM featureLocation WHERE featureId=${featureId} AND version=${revision})`
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
