// VALIDATION
import { z } from 'zod'

/** Explicit clear differs from inheritance, including for empty arrays and locales. */
export type PlaceOverride<T> =
  | { mode: 'inherit' }
  | { mode: 'override'; value: T }
  | { mode: 'clear' }

export type PlaceBrand = {
  identifiers: Record<string, string>
  names: Record<string, string>
}

/** Publication-pinned references; address records retain SaanSeoi's own schema. */
export type PlaceAddress = {
  status: 'resolved' | 'unresolved'
  address2dId: string | null
  address3dId: string | null
  address3dUnitId: string | null
  addressSnapshotId: string | null
  records: Record<string, unknown>
  fallbackDisplay: Record<string, string>
}

/** Location is adopted atomically so a new unit cannot inherit an old building. */
export type PlaceLocation = {
  geometry: { type: 'Point'; coordinates: [number, number] }
  address: PlaceAddress
}

export type PlaceFacts = {
  names: Record<string, string>
  phoneNumber: string[]
  brands: PlaceBrand[]
  location: PlaceLocation
}

export type FeaturePlaceOverrides = {
  names?: Record<string, PlaceOverride<string>>
  phoneNumber?: PlaceOverride<string[]>
  brands?: PlaceOverride<PlaceBrand[]>
  location?: PlaceOverride<PlaceLocation>
}

export const ProjectPlacePolicySchema = z.strictObject({
  version: z.literal(1),
  coordinates: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('automatic') }),
    z.strictObject({ mode: z.literal('review') }),
    z.strictObject({
      mode: z.literal('withinDistance'),
      maxMetres: z.number().finite().nonnegative(),
    }),
  ]),
  address: z.enum(['automatic', 'review']),
  unit: z.enum(['automatic', 'review']),
  establishment: z.enum(['automatic', 'review']),
})

export type ProjectPlacePolicy = z.infer<typeof ProjectPlacePolicySchema>

/** Unconfigured projects never silently accept a changed location or identity. */
export const DEFAULT_PROJECT_PLACE_POLICY: ProjectPlacePolicy = {
  version: 1,
  coordinates: { mode: 'review' },
  address: 'review',
  unit: 'review',
  establishment: 'review',
}
