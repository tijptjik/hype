// VALIDATION
import { z } from 'zod'
import type { LocationEntity } from './factsDetails'
import type { LocationFootprint } from './footprint'
import type { OperatingStatus, BuildingStatus } from './lifecycle'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'

/** Explicit clear differs from inheritance, including for empty arrays and locales. */
export type LocationOverride<T> =
  | { mode: 'inherit' }
  | { mode: 'override'; value: T }
  | { mode: 'clear' }

export type LocationBrand = {
  identifiers: Record<string, string>
  names: Record<string, string>
}

/** Publication-pinned references; address records retain SaanSeoi's own schema. */
export type LocationAddress = {
  /** Local hood/locality selections; administrative and landform memberships remain marker-derived. */
  divisionOverrides?: import('#lib/addresses/divisions.js').AddressDivisionOverrides
  /** Locally authored SaanSeoi content; never a claim of upstream publication. */
  authored?: LocalLocationAddress
  status: 'resolved' | 'unresolved'
  address2dId: string | null
  address3dId: string | null
  address3dUnitId: string | null
  addressSnapshotId: string | null
  records: Record<string, unknown>
  fallbackDisplay: Record<string, string>
  /** Explicit complete labels; empty strings suppress display. */
  displayOverrides?: Record<string, string>
}

/** Location is adopted atomically so a new unit cannot inherit an old building. */
export type LocationPosition = {
  geometry: { type: 'Point'; coordinates: [number, number] }
  address: LocationAddress
}

/** Normalized Feature display projection; persisted revisions use LocationFactsSnapshot. */
export type LocationFacts = {
  /** Optional area geometry; the Location point remains the map anchor. */
  footprint?: LocationFootprint | null
  /** Additional typed facts survive editing without becoming generic Feature properties. */
  entity?: LocationEntity
  /** Absent in legacy snapshots means unknown; never rewrite immutable history. */
  operatingStatus?: OperatingStatus | null
  buildingStatus?: BuildingStatus | null
  /** Explicit successor or relocated branch; prior names/addresses remain in immutable revisions. */
  successorLocationId?: string | null
  names: Record<string, string>
  phoneNumber: string[]
  brands: LocationBrand[]
  location: LocationPosition
}

export type FeatureLocationOverrides = {
  footprint?: LocationOverride<LocationFootprint>
  operatingStatus?:
    | { mode: 'inherit' }
    | { mode: 'override'; value: OperatingStatus | null }
  buildingStatus?:
    | { mode: 'inherit' }
    | { mode: 'override'; value: BuildingStatus | null }
  successorLocationId?: { mode: 'inherit' } | { mode: 'override'; value: string | null }
  names?: Record<string, LocationOverride<string>>
  phoneNumber?: LocationOverride<string[]>
  brands?: LocationOverride<LocationBrand[]>
  location?: LocationOverride<LocationPosition>
}

export const RelocationPolicySchema = z.enum(['fixed', 'review', 'follow'])
export type RelocationPolicy = z.infer<typeof RelocationPolicySchema>

/** Pre-release v1 uses explicit follow consent and a separate relocation rule. */
export const ProjectLocationPolicySchema = z.strictObject({
  version: z.literal(1),
  discoveryRadiusMetres: z.number().int().min(50).max(1000).optional(),
  coordinates: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('follow') }),
    z.strictObject({ mode: z.literal('review') }),
    z.strictObject({
      mode: z.literal('withinDistance'),
      maxMetres: z.number().finite().nonnegative(),
    }),
  ]),
  address: z.enum(['follow', 'review']),
  unit: z.enum(['follow', 'review']),
  establishment: z.enum(['follow', 'review']),
  relocation: RelocationPolicySchema.default('review'),
})

export type ProjectLocationPolicy = z.infer<typeof ProjectLocationPolicySchema>

/** Unconfigured projects never silently accept a changed location or identity. */
export const DEFAULT_PROJECT_LOCATION_POLICY: ProjectLocationPolicy = {
  version: 1,
  coordinates: { mode: 'review' },
  address: 'review',
  unit: 'review',
  establishment: 'review',
  relocation: 'review',
}

/**
 * Resolve a Layer override before the Project's validated relocation default.
 * @param projectPolicy Persisted Project policy; null/absence uses review defaults.
 * @param layerPolicy Nullable Layer override; null/absence means inherit.
 * @returns The effective fixed, review or follow rule.
 * @remarks Resolving consent never applies a move or reopens a rejected candidate.
 */
export function resolveRelocationPolicy(
  projectPolicy: unknown,
  layerPolicy?: RelocationPolicy | null,
): RelocationPolicy {
  const policy = ProjectLocationPolicySchema.parse(
    projectPolicy ?? DEFAULT_PROJECT_LOCATION_POLICY,
  )
  return layerPolicy == null
    ? policy.relocation
    : RelocationPolicySchema.parse(layerPolicy)
}
