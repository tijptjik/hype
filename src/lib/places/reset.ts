// VALIDATION
import { z } from 'zod'
import { PlaceFactsSchema } from './validation'
// ADDRESS
import {
  ADDRESS_LOCALES,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeaturePlaceOverrides } from './model'
import type {
  FeatureDBPartial,
  FeatureI18nPartial,
} from '#lib/db/zod/schema/feature.types.js'

/** Reset intent contains field identities only; source values are always read server-side. */
export const PlaceResetSchema = z
  .strictObject({
    expectedRevision: z.string().min(1),
    names: z
      .array(z.enum(['en', 'zhHant', 'zhHans']))
      .max(3)
      .default([]),
    phoneNumber: z.boolean().default(false),
    location: z.boolean().default(false),
  })
  .refine(
    value => value.names.length > 0 || value.phoneNumber || value.location,
    'Choose at least one Place field to reset',
  )
export type PlaceReset = z.infer<typeof PlaceResetSchema>

/**
 * Materialize explicit resets from independently accepted source revisions.
 * @param input Validated reset, accepted facts/location and the proposed normal Feature form.
 * @returns Copied form values and overrides; phone values are returned for a targeted atomic upsert.
 * @remarks Reset wins over edits to the same field in this submission. Unselected fields,
 * descriptions and unrelated metadata remain intact. Invalid source values fail before writes.
 */
export function materializePlaceReset(input: {
  reset: PlaceReset
  facts: unknown
  locationFacts: unknown
  overrides: FeaturePlaceOverrides
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
}): {
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
  overrides: FeaturePlaceOverrides
  phoneNumber: string[] | undefined
} {
  const facts = PlaceFactsSchema.parse(input.facts)
  const location = PlaceFactsSchema.parse(input.locationFacts).location
  const overrides = structuredClone(input.overrides)
  const data = structuredClone(input.data)
  const i18n = structuredClone(input.i18n)
  // Reset only the requested locales; never fabricate a translation absent from the source.
  for (const locale of input.reset.names) {
    const tag = ADDRESS_LOCALES[locale]
    const name = facts.names[tag]
    if (!name?.trim() || name.length > 128)
      throw new Error(`Accepted Place has no valid name for ${locale}`)
    i18n[locale] = { ...i18n[locale], title: name, titleGen: false }
    overrides.names ??= {}
    overrides.names[tag] = { mode: 'inherit' }
  }
  if (input.reset.phoneNumber) overrides.phoneNumber = { mode: 'inherit' }
  if (input.reset.location) {
    // Geometry and canonical address are one unit; clear all local address corrections.
    const address = FeatureAddressSchema.parse({
      version: 1,
      source: location.address,
      coordinates: location.geometry.coordinates,
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
        displayAddress: getAddressDisplay(address, locale),
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
