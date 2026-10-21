// VALIDATION
import { z } from 'zod'
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { AddressDivisionOverridesSchema } from '#lib/addresses/divisions.js'
// TYPES
import type {
  FeatureLocationOverrides,
  LocationFacts,
  LocationPosition,
  LocationOverride,
} from './model'

const names = z.record(z.string(), z.string())
/** Complete authored name set; absent locales are explicitly removed by the correction writer. */
export const LocationNamesEditSchema = z
  .record(z.string().min(1).max(64), z.string().trim().min(1).max(1000))
  .refine(
    value => Object.keys(value).length > 0 && Object.keys(value).length <= 100,
    'Keep at least one name and no more than 100 languages',
  )
const brands = z.array(z.strictObject({ identifiers: names, names }))
const location = z.strictObject({
  geometry: z.strictObject({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  address: z
    .strictObject({
      divisionOverrides: AddressDivisionOverridesSchema.optional(),
      status: z.enum(['resolved', 'unresolved']),
      authored: LocalLocationAddressSchema.optional(),
      address2dId: z.string().min(1).nullable(),
      address3dId: z.string().min(1).nullable(),
      address3dUnitId: z.string().min(1).nullable(),
      addressSnapshotId: z.string().min(1).nullable(),
      records: z.record(z.string(), z.unknown()),
      fallbackDisplay: names,
    })
    .refine(
      address =>
        !address.authored ||
        (address.status === 'unresolved' &&
          !address.address2dId &&
          !address.address3dId &&
          !address.address3dUnitId &&
          !address.addressSnapshotId &&
          !Object.keys(address.records).length),
      'Authored addresses cannot claim canonical publication evidence',
    )
    .refine(
      address =>
        address.status !== 'resolved' ||
        (address.addressSnapshotId !== null &&
          Boolean(
            address.address2dId || address.address3dId || address.address3dUnitId,
          )),
      'Resolved addresses require canonical identity and a pinned snapshot',
    ),
}) satisfies z.ZodType<LocationPosition>

/**
 * Construct the three-state override validator without collapsing clear into inherit.
 * @param valueSchema Validator for a whole replacement value.
 * @returns Validator for inherit, clear or a validated replacement.
 */
function override<T>(valueSchema: z.ZodType<T>): z.ZodType<LocationOverride<T>> {
  return z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('inherit') }),
    z.strictObject({ mode: z.literal('clear') }),
    z.strictObject({ mode: z.literal('override'), value: valueSchema }),
  ])
}

export const LocationFactsSchema = z.strictObject({
  names,
  phoneNumber: z.array(z.string()),
  brands,
  location,
}) satisfies z.ZodType<LocationFacts>

export const FeatureLocationOverridesSchema = z.strictObject({
  names: z.record(z.string(), override(z.string())).optional(),
  phoneNumber: override(z.array(z.string())).optional(),
  brands: override(brands).optional(),
  location: override(location).optional(),
}) satisfies z.ZodType<FeatureLocationOverrides>
