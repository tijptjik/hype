// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. LOCAL PLACE CREATION
// 2. IMMUTABLE LOCAL ADDRESS REVISIONS
// ---

// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// SHARED PARSER
import { parseAddressContent } from '@saanseoi/address'
// SNAPSHOT CONTRACT
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
// VALIDATION
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import {
  authoredDivisionOverrides,
  markerDerivedAddressContent,
} from '#lib/addresses/divisions.js'
import { validateAddressDivisionOverrides } from './addressDivisions'
import {
  validateLocationStatusKind,
  type OperatingStatus,
  type BuildingStatus,
} from '#lib/locations/lifecycle.js'

import { LocationNamesEditSchema } from '#lib/locations/validation.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import { LocalLocationFootprintSchema } from '#lib/locations/footprint.js'
import {
  prepareLocationCorrection,
  readOrganisationLocation,
} from './organisationLocation'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
// TYPES
import type { AddressDivisionOverrides } from '#lib/addresses/divisions.js'
import type { Database } from '#lib/types.js'

/**
 * Create a shared unresolved or private manual Location and its immutable baseline.
 * @param db Request-local database with atomic D1 batch support.
 * @param organisationId Persisted, authorized owning organisation.
 * @param input Local facts, the manual/unresolved distinction and explicit sharing preference.
 * @param actorId Authenticated author retained in baseline provenance.
 * @returns Stable local Location identity and initial revision identity.
 * @remarks The caller must authorize organisation management. No Feature is linked or
 * rewritten; canonical identities and addresses require separate verified workflows.
 * Sharing preference records upstream contribution consent, independently of shared
 * unresolved visibility or private manual visibility. Organisation ownership is retained.
 */
export async function createLocalLocation(
  db: Database,
  organisationId: string,
  input: unknown,
  actorId: string,
): Promise<{ locationId: string; revisionId: string }> {
  const parsed = LocalLocationInputSchema.parse(input)
  // A newly authored historic record may point only to a visible existing successor.
  if (parsed.facts.successorLocationId) {
    const successor = await db
      .select()
      .from(locationTable)
      .where(
        and(
          eq(locationTable.id, parsed.facts.successorLocationId),
          sql`${locationTable.state}!='redirect'`,
          sql`(${locationTable.state}!='manual' OR ${locationTable.ownerOrganisationId}=${organisationId})`,
        ),
      )
      .get()
    if (!successor || (parsed.state !== 'manual' && successor.state === 'manual'))
      throw new Error('Successor Location unavailable')
  }
  if (parsed.facts.location.address.authored)
    parsed.facts.location.address.authored = markerDerivedAddressContent(
      parsed.facts.location.address.authored,
    )
  await validateAddressDivisionOverrides(db, {
    ...authoredDivisionOverrides(parsed.facts.location.address.authored),
    ...parsed.facts.location.address.divisionOverrides,
  })
  const locationId = nanoid(12)
  const revisionId = nanoid(12)
  const payload = {
    kind: 'local-baseline',
    actorId,
    organisationId,
    input: parsed,
    ...(parsed.parseSource
      ? {
          localAddress: {
            parse: parseAddressContent(parsed.parseSource),
            review: 'authored',
          },
        }
      : {}),
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // Fence successor visibility in the same transaction as identity/baseline creation.
  const successorGuard = parsed.facts.successorLocationId
    ? sql`EXISTS(SELECT 1 FROM location successor WHERE successor.id=${parsed.facts.successorLocationId}
        AND successor.state!='redirect' AND (successor.state!='manual' OR successor.ownerOrganisationId=${organisationId})
        AND (${Number(parsed.state === 'manual')} OR successor.state!='manual'))`
    : sql`1`
  // An atomic batch cannot leave an identity behind if its baseline insert fails.
  // These SELECTs follow the schema column order, including generated timestamps.
  const result = await db.batch([
    db
      .insert(locationTable)
      .select(sql`SELECT ${locationId},NULL,${parsed.kind},${organisationId},${parsed.state},'current',
      NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${successorGuard}`)
      .returning({ id: locationTable.id }),
    db
      .insert(locationRevision)
      .select(sql`SELECT ${revisionId},${locationId},1,'local',NULL,NULL,NULL,NULL,
      ${contentHash},${JSON.stringify(payload)},${serializeLocationFacts(parsed.facts, parsed.kind)},
      strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS(SELECT 1 FROM location WHERE id=${locationId})`),
  ])
  if (!result[0].length) throw new Error('Successor Location unavailable')
  return { locationId, revisionId }
}

/**
 * Save names, optional footprints and structured address content without rewriting accepted or historical revisions.
 * @param db Request-local database.
 * @param input Authorized Organisation, expected revisions and optional names, authored content, marker and subjective selections.
 * @returns New revision identity, or null if ownership, source identity or revision changed.
 * @remarks Omitted groups retain their effective facts and canonical evidence. Existing Features retain their accepted revision until explicitly adopting this one.
 */
export async function updateLocalLocationAddress(
  db: Database,
  input: {
    locationId: string
    organisationId: string | null
    expectedRevisionId: string
    expectedOrganisationRevision?: string | null
    footprint?: unknown
    operatingStatus?: OperatingStatus | null
    buildingStatus?: BuildingStatus | null
    successorLocationId?: string | null
    names?: Record<string, string>
    address?: unknown
    coordinates?: [number, number]
    divisionOverrides?: AddressDivisionOverrides
    parseSource?: Record<string, string>
    actorId: string
  },
): Promise<{ revisionId: string; organisationRevision: string | null } | null> {
  if (!input.actorId.trim() || !input.organisationId) return null
  const footprint = LocalLocationFootprintSchema.nullable()
    .optional()
    .parse(input.footprint)
  const names =
    input.names === undefined ? undefined : LocationNamesEditSchema.parse(input.names)
  const address =
    input.address === undefined
      ? undefined
      : markerDerivedAddressContent(LocalLocationAddressSchema.parse(input.address))
  await validateAddressDivisionOverrides(db, {
    ...authoredDivisionOverrides(address),
    ...input.divisionOverrides,
  })
  const baseline = await db
    .select()
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationTable.id, input.locationId),
        eq(locationRevision.id, input.expectedRevisionId),
        sql`${locationTable.state}!='redirect' AND (${locationTable.state}!='manual' OR ${locationTable.ownerOrganisationId}=${input.organisationId})`,
        sql`${locationRevision.sequence}=(SELECT max(sequence) FROM locationRevision r WHERE r.locationId=${input.locationId} AND (${locationTable.state}!='linked' OR r.origin='saanseoi'))`,
      ),
    )
    .get()
  if (!baseline) return null
  const current = await readOrganisationLocation(
    db,
    input.organisationId,
    input.locationId,
  )
  if (
    input.expectedOrganisationRevision !== undefined &&
    input.expectedOrganisationRevision !== (current?.revision ?? null)
  )
    return null
  const facts = baseline.locationRevision.facts
  const before = resolveFeatureLocation(facts, facts.location, current?.overrides ?? {})
  if (!before.location) return null
  // Omitted status fields stay absent, so a no-change save cannot create another revision.
  const operatingStatus =
    input.operatingStatus === undefined ? before.operatingStatus : input.operatingStatus
  const buildingStatus =
    input.buildingStatus === undefined ? before.buildingStatus : input.buildingStatus
  const successorLocationId =
    input.successorLocationId === undefined
      ? before.successorLocationId
      : input.successorLocationId
  const status = {
    ...(operatingStatus !== undefined ? { operatingStatus } : {}),
    ...(buildingStatus !== undefined ? { buildingStatus } : {}),
    ...(successorLocationId !== undefined ? { successorLocationId } : {}),
  }
  validateLocationStatusKind(baseline.location.kind, status)
  // Save name and location groups together while retaining untouched canonical address evidence.
  const after = {
    ...before,
    ...(footprint !== undefined ? { footprint } : {}),
    ...status,
    ...(names ? { names } : {}),
    location: {
      ...before.location,
      ...(input.coordinates
        ? { geometry: { type: 'Point' as const, coordinates: input.coordinates } }
        : {}),
      address: address
        ? {
            ...(input.divisionOverrides
              ? { divisionOverrides: input.divisionOverrides }
              : {}),
            status: 'unresolved' as const,
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            addressSnapshotId: null,
            records: {},
            fallbackDisplay: {},
            authored: address,
          }
        : {
            ...before.location.address,
            ...(input.divisionOverrides
              ? { divisionOverrides: input.divisionOverrides }
              : {}),
          },
    },
  }
  const correction = await prepareLocationCorrection(db, {
    organisationId: input.organisationId,
    locationId: input.locationId,
    actorId: input.actorId,
    before,
    after,
    currentOverrides: current?.overrides ?? {},
    ...(input.parseSource
      ? {
          provenance: {
            localAddress: {
              parse: parseAddressContent(input.parseSource),
              review: 'authored',
            },
          },
        }
      : {}),
    expectedBaselineRevisionId: input.expectedRevisionId,
    expectedOrganisationRevision: current?.revision ?? null,
    guard: sql`EXISTS(SELECT 1 FROM location p JOIN locationRevision r ON r.locationId=p.id
      WHERE p.id=${input.locationId} AND p.state=${baseline.location.state} AND p.ssId IS ${baseline.location.ssId}
      AND p.ownerOrganisationId IS ${baseline.location.ownerOrganisationId} AND r.id=${input.expectedRevisionId}
      AND (${Number(baseline.location.ssId === null && baseline.location.ownerOrganisationId === input.organisationId)} OR r.sequence=(SELECT max(sequence) FROM locationRevision WHERE locationId=p.id AND (p.state!='linked' OR origin='saanseoi'))))
`,
  })
  if (correction.queries.length)
    await db.batch(
      correction.queries as [
        import('drizzle-orm/batch').BatchItem<'sqlite'>,
        ...import('drizzle-orm/batch').BatchItem<'sqlite'>[],
      ],
    )
  const owned = await db.get<{ owned: number }>(
    sql`SELECT CASE WHEN ${correction.guard} THEN 1 ELSE 0 END AS owned`,
  )
  return owned.owned
    ? {
        revisionId: correction.baselineRevision?.id ?? input.expectedRevisionId,
        organisationRevision: correction.organisationRevision,
      }
    : null
}
