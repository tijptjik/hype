// VALIDATION
import { z } from 'zod'
// TYPES
import type {
  FeaturePlaceOverrides,
  PlaceFacts,
  PlaceLocation,
  PlaceOverride,
} from './model'

const names = z.record(z.string(), z.string())
const brands = z.array(z.strictObject({ identifiers: names, names }))
const location = z.strictObject({
  geometry: z.strictObject({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  address: z
    .strictObject({
      status: z.enum(['resolved', 'unresolved']),
      address2dId: z.string().min(1).nullable(),
      address3dId: z.string().min(1).nullable(),
      address3dUnitId: z.string().min(1).nullable(),
      addressSnapshotId: z.string().min(1).nullable(),
      records: z.record(z.string(), z.unknown()),
      fallbackDisplay: names,
    })
    .refine(
      address =>
        address.status !== 'resolved' ||
        (address.addressSnapshotId !== null &&
          Boolean(
            address.address2dId || address.address3dId || address.address3dUnitId,
          )),
      'Resolved addresses require canonical identity and a pinned snapshot',
    ),
}) satisfies z.ZodType<PlaceLocation>

/**
 * Construct the three-state override validator without collapsing clear into inherit.
 * @param valueSchema Validator for a whole replacement value.
 * @returns Validator for inherit, clear or a validated replacement.
 */
function override<T>(valueSchema: z.ZodType<T>): z.ZodType<PlaceOverride<T>> {
  return z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('inherit') }),
    z.strictObject({ mode: z.literal('clear') }),
    z.strictObject({ mode: z.literal('override'), value: valueSchema }),
  ])
}

export const PlaceFactsSchema = z.strictObject({
  names,
  phoneNumber: z.array(z.string()),
  brands,
  location,
}) satisfies z.ZodType<PlaceFacts>

export const FeaturePlaceOverridesSchema = z.strictObject({
  names: z.record(z.string(), override(z.string())).optional(),
  phoneNumber: override(z.array(z.string())).optional(),
  brands: override(brands).optional(),
  location: override(location).optional(),
}) satisfies z.ZodType<FeaturePlaceOverrides>
