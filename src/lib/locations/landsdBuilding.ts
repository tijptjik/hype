// VALIDATION
import { z } from 'zod'
import { BuildingDetailsSchema } from './factsDetails'
// TYPES
import type { BuildingDetails } from './factsDetails'

const sourceSchema = z.object({
  BuildingCSUID: z.string().min(1),
  BuildingID: z.number().int().nonnegative().optional(),
  GeoRefNo: z.string().optional(),
  BuildingBlockType: z.enum([
    'Tower',
    'Podium',
    'Temporary Structure',
    'Open-sided Structure',
  ]),
  Status: z.string().optional(),
  DateCreate: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
  DateStamp: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
  BaseHeight: z.number().finite().nullish(),
  TopHeight: z.number().finite().nullish(),
  Storeys: z.number().int().nonnegative().nullish(),
  StoreysInBasement: z.number().int().nonnegative().nullish(),
  Shape_Area: z.number().finite().nonnegative().optional(),
})
const structureTypes = {
  Tower: 'tower',
  Podium: 'podium',
  'Temporary Structure': 'temporary_structure',
  'Open-sided Structure': 'open_sided_structure',
} as const

/** Extract useful LandsD building facts without inferring operation, demolition or construction dates.
 * @param properties Original Building layer attributes from the retained September 2026 schema.
 * @param geometryReference Optional immutable footprint reference supplied by a future source adapter.
 * @returns Validated building-specific details, preserving LandsD identity and the HKPD vertical datum.
 * @remarks OBJECTID is a delivery row ID. DateCreate/DateStamp are source-record dates.
 * Source geometry/material/roof assertions remain raw evidence, not user-facing inferred facts.
 */
export function projectLandsdBuildingDetails(
  properties: unknown,
  geometryReference?: { releaseId: string; geometryRevisionId: string },
): BuildingDetails {
  const value = sourceSchema.parse(properties)
  const base = value.BaseHeight ?? undefined,
    top = value.TopHeight ?? undefined
  const day = (raw: string): string =>
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  return BuildingDetailsSchema.parse({
    source: {
      inventory: 'landsd',
      buildingCSUID: value.BuildingCSUID,
      ...(value.BuildingID !== undefined ? { buildingId: value.BuildingID } : {}),
      ...(value.GeoRefNo ? { geoRefNo: value.GeoRefNo } : {}),
      ...(value.Status ? { recordStatus: value.Status } : {}),
      ...(value.DateCreate ? { recordCreatedOn: day(value.DateCreate) } : {}),
      ...(value.DateStamp ? { recordUpdatedOn: day(value.DateStamp) } : {}),
    },
    structureType: structureTypes[value.BuildingBlockType],
    ...(value.Storeys != null ? { storeysAboveGround: value.Storeys } : {}),
    ...(value.StoreysInBasement != null
      ? { storeysBelowGround: value.StoreysInBasement }
      : {}),
    ...(base !== undefined || top !== undefined
      ? {
          elevations: {
            verticalDatum: 'HKPD',
            ...(base !== undefined ? { baseMetres: base } : {}),
            ...(top !== undefined ? { topMetres: top } : {}),
          },
        }
      : {}),
    ...(base !== undefined && top !== undefined && top >= base
      ? {
          heightMetres: Math.round((top - base) * 1e6) / 1e6,
          heightMethod: 'top_minus_base',
        }
      : {}),
    ...(geometryReference
      ? {
          footprint: {
            mode: 'reference',
            inventory: 'landsd',
            sourceRecordId: value.BuildingCSUID,
            ...geometryReference,
            ...(value.Shape_Area !== undefined
              ? { areaSquareMetres: value.Shape_Area }
              : {}),
          },
        }
      : {}),
  })
}
