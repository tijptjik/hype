import { sharedLocationFacts } from './locationShared'
// SNAPSHOT CONTRACT
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
import { classifyLocationFactsKind } from '#lib/locations/factsKind.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
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
import {
  location as locationTable,
  locationRevision,
  locationRevisionInput,
} from '../schema/location'
import { canOperateIn } from '#lib/features/locationPolicy.js'
import { locationOccupancy, locationMembership } from '../schema/locationRelationships'
// SHARED PARSER
import { parseAddressContent } from '#lib/addresses/parseAddress.js'
// VALIDATION
import { LocalizedCurationTextSchema } from '#lib/locations/curationIdentity.js'
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
import { LocationKindSchema, type LocationKind } from '#lib/locations/kinds.js'
import type { Database } from '#lib/types.js'

/**
 * Create a shared unresolved or private manual Location and its immutable baseline.
 * @param db Request-local database with atomic D1 batch support.
 * @param organisationId Persisted, authorized owning organisation.
 * @param input Local facts, the manual/unresolved distinction and explicit sharing preference.
 * @param actorId Authenticated author retained in baseline provenance.
 * @param verified Verified server-side import identity and provenance; never client-supplied facts.
 * @returns Stable local Location identity and initial revision identity.
 * @remarks The caller must authorize organisation management. No Feature is linked or
 * rewritten; canonical identities and addresses require separate verified workflows.
 * Building parts require a visible owning building; optional parent parts must share it.
 * Identity, baseline and membership assertions commit atomically without an occupant.
 * Sharing preference records upstream contribution consent, independently of shared
 * unresolved visibility or private manual visibility. Organisation ownership is retained.
 */
export async function createLocalLocation(
  db: Database,
  organisationId: string,
  input: unknown,
  actorId: string,
  verified?: {
    locationId: string
    buildingSource: import('#lib/locations/buildingSource.js').BuildingSource
  },
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
  if (parsed.facts.location.address.authored) {
    parsed.facts.location.address.authored = markerDerivedAddressContent(
      parsed.facts.location.address.authored,
    )
    if (parsed.kind === 'building')
      parsed.facts.location.address.authored = {
        ...parsed.facts.location.address.authored,
        unit: null,
        unitI18n: {},
      }
  }
  await validateAddressDivisionOverrides(db, {
    ...authoredDivisionOverrides(parsed.facts.location.address.authored),
    ...parsed.facts.location.address.divisionOverrides,
  })
  const locationId = verified?.locationId ?? nanoid(12)
  const revisionId = nanoid(12)
  // The owning building is an explicit identity; address text never resolves membership.
  if (parsed.kind === 'building_part') {
    for (const [id, kind] of [
      [parsed.buildingId, 'building'],
      [parsed.parentPartId, 'building_part'],
    ] as const) {
      if (!id) continue
      const parent =
        await db.get(sql`SELECT id FROM location WHERE id=${id} AND matchingType=${kind}
        AND state!='redirect' AND (state!='manual' OR (${parsed.state}='manual' AND ownerOrganisationId=${organisationId}))`)
      if (!parent) throw new Error('Building or parent part unavailable')
    }
  }
  // Operating relationships are explicit, scoped host identities, never inferred from copied text.
  if (parsed.operatesInLocationId) {
    const host = await db.get<{
      matchingType: string
    }>(sql`SELECT matchingType FROM location
      WHERE id=${parsed.operatesInLocationId} AND state!='redirect'
      AND (state!='manual' OR (${parsed.state}='manual' AND ownerOrganisationId=${organisationId}))`)
    if (!host || !canOperateIn(parsed.kind, host.matchingType))
      throw new Error('Operating host unavailable or incompatible')
  }
  const rawSource = {
    kind: verified ? 'building-export-baseline' : 'local-baseline',
    ...(verified ? { buildingSource: verified.buildingSource } : {}),
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
    new TextEncoder().encode(JSON.stringify(rawSource)),
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
  // Create the owning edge before optional nesting, inside the identity/baseline transaction.
  const memberships =
    parsed.kind === 'building_part' && parsed.buildingId
      ? [parsed.buildingId, ...(parsed.parentPartId ? [parsed.parentPartId] : [])].map(
          parentId => {
            const id = nanoid(12)
            return db.insert(locationMembership).values({
              id,
              relationshipId: id,
              previousRevisionId: null,
              scopeOrganisationId: parsed.state === 'manual' ? organisationId : null,
              assertionState: 'asserted',
              evidence: [],
              provenance: { process: 'building-part-authoring' },
              actorId,
              childLocationId: locationId,
              parentLocationId: parentId,
              membershipState: 'current',
            })
          },
        )
      : []
  // These SELECTs follow the schema column order, including generated timestamps.
  const result = await db.batch([
    db
      .insert(locationTable)
      .select(sql`SELECT ${locationId},NULL,${locationTaxonomy(parsed.kind).kind},${locationTaxonomy(parsed.kind).class},${organisationId},${parsed.state},'current',
      NULL,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${successorGuard}`)
      .returning({ id: locationTable.id }),
    db
      .insert(locationRevisionInput)
      .select(sql`SELECT ${revisionId},${locationId},1,'local',NULL,NULL,NULL,NULL,
      ${contentHash},${JSON.stringify(rawSource)},${serializeLocationFacts(parsed.facts, parsed.kind)},
      strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS(SELECT 1 FROM location WHERE id=${locationId})`),
    ...memberships,
    ...(parsed.operatesInLocationId
      ? (() => {
          const id = nanoid(12)
          return [
            db.insert(locationOccupancy).values({
              id,
              relationshipId: id,
              previousRevisionId: null,
              scopeOrganisationId: parsed.state === 'manual' ? organisationId : null,
              assertionState: 'asserted',
              evidence: [],
              provenance: { process: 'operating-location-authoring' },
              actorId,
              establishmentLocationId: locationId,
              containerLocationId: parsed.operatesInLocationId,
              occupancyState: 'current',
            }),
          ]
        })()
      : []),
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
    branch?: Record<string, string>
    format?: Record<string, string>
    branchId?: string
    kind?: LocationKind
    expectedKind?: LocationKind
    address?: unknown
    coordinates?: [number, number]
    divisionOverrides?: AddressDivisionOverrides
    displayOverrides?: Record<string, string>
    parseSource?: Record<string, string>
    actorId: string
    allowSharedBaseline?: boolean
  },
): Promise<{ revisionId: string; organisationRevision: string | null } | null> {
  if (!input.actorId.trim() || !input.organisationId) return null
  const footprint = LocalLocationFootprintSchema.nullable()
    .optional()
    .parse(input.footprint)
  const names =
    input.names === undefined ? undefined : LocationNamesEditSchema.parse(input.names)
  let address =
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
        sql`${locationRevision.version}=(SELECT max(version) FROM locationRevisionContent r WHERE r.locationId=${input.locationId} AND (${locationTable.state}!='linked' OR r.origin='saanseoi'))`,
      ),
    )
    .get()
  if (!baseline) return null
  let kind =
    input.kind === undefined
      ? baseline.location.kind
      : LocationKindSchema.parse(input.kind)
  if (input.expectedKind !== undefined && input.expectedKind !== baseline.location.kind)
    return null
  const current = await readOrganisationLocation(
    db,
    input.organisationId,
    input.locationId,
  )
  if (
    (!input.allowSharedBaseline || input.expectedOrganisationRevision !== undefined) &&
    (input.expectedOrganisationRevision ?? null) !== (current?.revision ?? null)
  )
    return null
  const facts = (
    await sharedLocationFacts(db, input.locationId, baseline.locationRevision.facts)
  ).facts
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
  kind = classifyLocationFactsKind(kind, { ...status, brands: before.brands ?? [] })
  if (
    kind !== baseline.location.kind &&
    (baseline.location.ssId !== null ||
      baseline.location.ownerOrganisationId !== input.organisationId)
  )
    return null
  // Creating or removing a physical part requires its dedicated membership flow.
  if (
    kind !== baseline.location.kind &&
    (kind === 'building_part' || baseline.location.kind === 'building_part')
  )
    throw new Error('Building part kind cannot be changed through address editing')
  if (address && kind === 'building') address = { ...address, unit: null, unitI18n: {} }
  validateLocationStatusKind(kind, status)
  // Save name and location groups together while retaining untouched canonical address evidence.
  const after = {
    ...before,
    ...(footprint !== undefined ? { footprint } : {}),
    ...status,
    ...(names ? { names } : {}),
    ...(input.branch !== undefined
      ? { branch: LocalizedCurationTextSchema.parse(input.branch) }
      : {}),
    ...(input.format !== undefined
      ? { format: LocalizedCurationTextSchema.parse(input.format) }
      : {}),
    ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
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
            snapshotId: null,
            rawSource: {},
            fallbackDisplay: {},
            authored: address,
            displayOverrides: input.displayOverrides,
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
    allowSharedBaseline: input.allowSharedBaseline,
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
    kindChange:
      kind !== baseline.location.kind
        ? { before: baseline.location.kind, after: kind }
        : undefined,
    expectedBaselineRevisionId: input.expectedRevisionId,
    expectedOrganisationRevision: current?.revision ?? null,
    guard: sql`EXISTS(SELECT 1 FROM location p JOIN locationRevisionContent r ON r.locationId=p.id
      WHERE p.id=${input.locationId} AND p.state=${baseline.location.state} AND p.ssId IS ${baseline.location.ssId}
      AND p.ownerOrganisationId IS ${baseline.location.ownerOrganisationId} AND p.matchingType IN (${baseline.location.kind},${kind}) AND r.id=${input.expectedRevisionId}
      AND (${Number(baseline.location.ssId === null && baseline.location.ownerOrganisationId === input.organisationId)} OR r.version=(SELECT max(version) FROM locationRevisionContent AS locationRevision WHERE locationId=p.id AND (p.state!='linked' OR origin='saanseoi'))))
`,
  })
  // Type changes share the new local baseline's guard and commit in the same batch as its facts.
  if (kind !== baseline.location.kind)
    correction.queries.push(
      db
        .update(locationTable)
        .set({
          entityKind: locationTaxonomy(kind).kind,
          class: locationTaxonomy(kind).class,
        })
        .where(
          and(
            eq(locationTable.id, input.locationId),
            eq(locationTable.kind, baseline.location.kind),
            correction.guard,
          ),
        ),
    )
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
