// VALIDATION
import { z } from 'zod'
// DOMAIN
import { locationTaxonomy } from './taxonomy'
import { LocationKindSchema } from './kinds'
import { LocationFactsSchema } from './validation'
import { classifyLocationFactsKind } from './factsKind'
import { LocationEntitySchema } from './factsDetails'
// TYPES
import type { LocationFacts } from './model'
import type { LocationEntity } from './factsDetails'
type LocationFactsKind = LocationEntity['kind']

// ═══════════════════════
// TABLE OF CONTENTS
// 1. VERSIONED STORAGE CONTRACT
// 2. DISPLAY PROJECTION AND STORAGE CODEC
// ---

const common = z.strictObject({
  names: LocationFactsSchema.shape.names,
  footprint: LocationFactsSchema.shape.footprint,
  phoneNumber: z.array(z.string()).optional(),
  websites: LocationFactsSchema.shape.websites,
  socials: LocationFactsSchema.shape.socials,
  accessibility: LocationFactsSchema.shape.accessibility,
  successorLocationId: z.string().trim().min(1).max(200).nullable().optional(),
  location: LocationFactsSchema.shape.location.extend({
    // A mountain or building need not have an address; the display projection supplies an empty one.
    address: LocationFactsSchema.shape.location.shape.address.nullable().optional(),
  }),
})

/** Every persisted revision carries its historical kind and explicit JSON contract version. */
const envelope = { schemaVersion: z.literal(1), common }
export const LocationFactsSnapshotSchema = z.discriminatedUnion('kind', [
  LocationEntitySchema.options[0].extend(envelope),
  LocationEntitySchema.options[1].extend(envelope),
  LocationEntitySchema.options[2].extend(envelope),
  LocationEntitySchema.options[3].extend(envelope),
  LocationEntitySchema.options[4].extend(envelope),
  LocationEntitySchema.options[5].extend(envelope),
  LocationEntitySchema.options[6].extend(envelope),
  LocationEntitySchema.options[7].extend(envelope),
  LocationEntitySchema.options[8].extend(envelope),
  LocationEntitySchema.options[9].extend(envelope),
  LocationEntitySchema.options[10].extend(envelope),
  LocationEntitySchema.options[11].extend(envelope),
  LocationEntitySchema.options[12].extend(envelope),
  LocationEntitySchema.options[13].extend(envelope),
  LocationEntitySchema.options[14].extend(envelope),
  LocationEntitySchema.options[15].extend(envelope),
  LocationEntitySchema.options[16].extend(envelope),
  LocationEntitySchema.options[17].extend(envelope),
])
export type LocationFactsSnapshot = z.infer<typeof LocationFactsSnapshotSchema>

/** Convert an application projection to a validated immutable snapshot.
 * @param facts Validated common display values and optional entity-specific facts.
 * @param kind Entity kind at revision creation, never inferred from a later identity row.
 * @returns Versioned storage envelope with a strict kind-specific details object.
 * @remarks Contacts are optional common data because HYPE's phone property is universal.
 */
export function createLocationFactsSnapshot(
  facts: LocationFacts,
  kind: LocationFactsKind,
): LocationFactsSnapshot {
  kind = classifyLocationFactsKind(
    LocationKindSchema.parse(
      ['premises_address', 'cadastral_address', 'linear_reference'].includes(kind)
        ? 'address'
        : kind,
    ),
    facts,
  )
  if (
    facts.entity &&
    facts.entity.kind !== 'unknown' &&
    JSON.stringify(locationTaxonomy(facts.entity.kind)) !==
      JSON.stringify(locationTaxonomy(kind))
  )
    throw new Error('Location details do not match the captured kind')
  const entity = facts.entity
  const details: Record<string, unknown> = { ...entity?.details }
  if (kind === 'establishment') {
    details.brands = facts.brands
    if (facts.operatingStatus !== undefined)
      details.operatingStatus = facts.operatingStatus
  } else if (facts.brands.length || facts.operatingStatus != null)
    throw new Error('Establishment facts require an establishment snapshot')
  if (kind === 'building') {
    if (facts.buildingStatus !== undefined)
      details.buildingStatus = facts.buildingStatus
  } else if (facts.buildingStatus != null)
    throw new Error('Building status requires a building snapshot')
  return LocationFactsSnapshotSchema.parse({
    schemaVersion: 1,
    kind,
    common: {
      names: facts.names,
      websites: facts.websites,
      socials: facts.socials,
      accessibility: facts.accessibility,
      ...(facts.footprint !== undefined ? { footprint: facts.footprint } : {}),
      location: facts.location,
      ...(facts.phoneNumber.length ? { phoneNumber: facts.phoneNumber } : {}),
      ...(facts.successorLocationId !== undefined
        ? { successorLocationId: facts.successorLocationId }
        : {}),
    },
    details,
  })
}

/** Read a versioned snapshot or retained legacy projection without rewriting source evidence.
 * @param value JSON text or a decoded snapshot/projection.
 * @returns Existing Feature display projection; building/natural-specific details remain attached.
 * @remarks Unsupported explicit versions fail closed. Legacy support is for retained evidence and old fixtures.
 */
export function readLocationFacts(value: unknown): LocationFacts {
  const raw = typeof value === 'string' ? JSON.parse(value) : value
  if (!raw || typeof raw !== 'object' || !('schemaVersion' in raw))
    return LocationFactsSchema.parse(raw)
  const snapshot = LocationFactsSnapshotSchema.parse(raw)
  const entity = LocationEntitySchema.parse({
    kind: snapshot.kind,
    details: snapshot.details,
  })
  const address = snapshot.common.location.address ?? {
    status: 'unresolved',
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    snapshotId: null,
    rawSource: {},
    fallbackDisplay: {},
  }
  const details = entity.details
  return LocationFactsSchema.parse({
    names: snapshot.common.names,
    ...(snapshot.common.websites !== undefined
      ? { websites: snapshot.common.websites }
      : {}),
    ...(snapshot.common.socials !== undefined
      ? { socials: snapshot.common.socials }
      : {}),
    ...(snapshot.common.accessibility !== undefined
      ? { accessibility: snapshot.common.accessibility }
      : {}),
    ...(snapshot.common.footprint !== undefined
      ? { footprint: snapshot.common.footprint }
      : {}),
    phoneNumber: snapshot.common.phoneNumber ?? [],
    brands: 'brands' in details ? (details.brands ?? []) : [],
    location: { ...snapshot.common.location, address },
    ...(snapshot.common.successorLocationId !== undefined
      ? { successorLocationId: snapshot.common.successorLocationId }
      : {}),
    ...('operatingStatus' in details && details.operatingStatus !== undefined
      ? { operatingStatus: details.operatingStatus }
      : {}),
    ...('buildingStatus' in details && details.buildingStatus !== undefined
      ? { buildingStatus: details.buildingStatus }
      : {}),
    // Existing projections retain their stable shape; additional typed building/natural facts round-trip intact.
    ...(entity.kind === 'building' ||
    entity.kind === 'natural' ||
    entity.kind === 'premises' ||
    entity.kind === 'building_part' ||
    entity.kind === 'infrastructure' ||
    entity.kind === 'street' ||
    entity.kind === 'built' ||
    entity.kind === 'structure' ||
    entity.kind === 'landform' ||
    entity.kind === 'coastal_feature' ||
    entity.kind === 'water_feature' ||
    entity.kind === 'service_point'
      ? { entity }
      : {}),
  })
}

/** Serialize one validated revision envelope for Drizzle and conditional raw SQL writes.
 * @param facts Existing display projection or an already-versioned snapshot.
 * @param kind Kind captured at the authoring boundary, when starting from a projection.
 * @returns Strict versioned JSON suitable for the locationRevision facts column.
 */
export function serializeLocationFacts(
  facts: LocationFacts | LocationFactsSnapshot,
  kind?: LocationFactsKind,
): string {
  if ('schemaVersion' in facts)
    return JSON.stringify(LocationFactsSnapshotSchema.parse(facts))
  const capturedKind = kind ?? facts.entity?.kind
  if (!capturedKind)
    throw new Error('A snapshot must capture an explicit Location kind')
  return JSON.stringify(createLocationFactsSnapshot(facts, capturedKind))
}

/** Capture the kind for generic Drizzle value inserts without changing the display contract.
 * @param facts Common display projection and retained typed details.
 * @param kind Historical kind at creation.
 * @returns A validated projection carrying the storage discriminator.
 */
export function prepareLocationFactsForWrite(
  facts: LocationFacts,
  kind: LocationFactsKind,
): LocationFacts {
  const snapshot = createLocationFactsSnapshot(facts, kind)
  return {
    ...readLocationFacts(snapshot),
    entity: LocationEntitySchema.parse({
      kind: snapshot.kind,
      details: snapshot.details,
    }),
  }
}
