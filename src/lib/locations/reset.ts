// CONTENT LOCALES
import {
  adaptContentMap,
  ContentTagInput,
  contentFormKey,
  contentStorageTag,
} from '#lib/i18n/contentRecords.js'
// VALIDATION
import { z } from 'zod'
import { LocationFactsSchema } from './validation'
// ADDRESS
import { addressSourceCoordinates } from '#lib/addresses/sourceCoordinates.js'
import {
  ADDRESS_LOCALES,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeatureLocationOverrides } from './model'
import type {
  FeatureDBPartial,
  FeatureI18nPartial,
} from '#lib/db/zod/schema/feature.types.js'

/** Reset intent contains field identities only; source values are always read server-side. */
export const LocationResetSchema = z
  .strictObject({
    expectedRevision: z.string().min(1),
    names: z.array(ContentTagInput).max(100).default([]),
    phoneNumber: z.boolean().default(false),
    location: z.boolean().default(false),
  })
  .refine(
    value => value.names.length > 0 || value.phoneNumber || value.location,
    'Choose at least one Location field to reset',
  )
export type LocationReset = z.infer<typeof LocationResetSchema>

/**
 * Materialize explicit resets from independently accepted source revisions.
 * @param input Validated reset, accepted facts/location and the proposed normal Feature form.
 * @returns Copied form values and overrides; phone values are returned for a targeted atomic upsert.
 * @remarks Reset wins over edits to the same field in this submission. Unselected fields,
 * descriptions and unrelated metadata remain intact. Invalid source values fail before writes.
 */
export function materializeLocationReset(input: {
  reset: LocationReset
  facts: unknown
  locationFacts: unknown
  overrides: FeatureLocationOverrides
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
}): {
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
  overrides: FeatureLocationOverrides
  phoneNumber: string[] | undefined
} {
  const facts = LocationFactsSchema.parse(input.facts)
  const location = LocationFactsSchema.parse(input.locationFacts).location
  const overrides = structuredClone(input.overrides)
  if (overrides.names)
    overrides.names = adaptContentMap(overrides.names, contentStorageTag)
  const data = structuredClone(input.data)
  const i18n = adaptContentMap(structuredClone(input.i18n))
  const names = adaptContentMap(facts.names)
  // Reset only the requested locales; never fabricate a translation absent from the source.
  for (const requested of input.reset.names) {
    const locale = contentFormKey(requested)
    const tag = contentStorageTag(requested)
    const name = names[locale]
    if (!name?.trim() || name.length > 128)
      throw new Error(`Accepted Location has no valid name for ${locale}`)
    i18n[locale] = { ...i18n[locale], title: name, titleGen: false }
    overrides.names ??= {}
    overrides.names[tag] = { mode: 'inherit' }
  }
  if (input.reset.phoneNumber) overrides.phoneNumber = { mode: 'inherit' }
  if (input.reset.location) {
    // Geometry and canonical address are one unit; clear all local address corrections.
    const address = FeatureAddressSchema.parse({
      version: 1,
      ...(data.addressMeta?.address?.locationDisplayMode === undefined
        ? {}
        : { locationDisplayMode: data.addressMeta?.address?.locationDisplayMode }),
      source: location.address,
      coordinates: addressSourceCoordinates(location.address),
      matchStatus: location.address.status,
      overrides: {},
    })
    data.geometry = location.geometry
    data.addressMeta = { ...data.addressMeta, address }
    for (const locale of Object.keys(ADDRESS_LOCALES) as Array<
      keyof typeof ADDRESS_LOCALES
    >) {
      if (!i18n[locale]) continue
      i18n[locale] = {
        ...i18n[locale],
        displayAddress: getAddressDisplay(
          address,
          locale,
          [],
          facts.entity?.kind,
          location.geometry.coordinates,
        ),
        displayAddressGen: true,
        addressProperties: {},
      }
    }
    overrides.location = { mode: 'inherit' }
  }
  return {
    data,
    i18n,
    overrides,
    phoneNumber: input.reset.phoneNumber ? facts.phoneNumber : undefined,
  }
}
