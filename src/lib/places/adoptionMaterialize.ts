// DOMAIN
import {
  ADDRESS_LOCALES,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { FeaturePlaceOverridesSchema, PlaceFactsSchema } from './validation'
// TYPES
import type { FeaturePlaceOverrides, PlaceFacts } from './model'
import type {
  FeatureDBPartial,
  FeatureI18nPartial,
} from '#lib/db/zod/schema/feature.types.js'

/**
 * Materialize one source group without discarding explicit Feature overrides.
 * @param input Accepted source groups, overrides and persisted Feature projection.
 * @returns Parent/locale projection and optional targeted phone replacement.
 * @remarks Descriptions and unselected groups survive. Invalid inherited values need review.
 */
export function materializePlaceAdoption(input: {
  fieldGroup: 'facts' | 'location'
  facts: PlaceFacts
  locationFacts: PlaceFacts
  overrides: FeaturePlaceOverrides
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
}): {
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
  phones?: string[]
} {
  const facts = PlaceFactsSchema.parse(input.facts)
  const location = PlaceFactsSchema.parse(input.locationFacts).location
  const overrides = FeaturePlaceOverridesSchema.parse(input.overrides)
  const data = structuredClone(input.data)
  const i18n = Object.fromEntries(
    Object.entries(structuredClone(input.i18n)).map(([locale, row]) => [
      Object.entries(ADDRESS_LOCALES).find(([, tag]) => tag === locale)?.[0] ?? locale,
      row,
    ]),
  )
  let phones: string[] | undefined
  if (input.fieldGroup === 'facts') {
    for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
      if ((overrides.names?.[tag]?.mode ?? 'inherit') !== 'inherit') continue
      const name = facts.names[tag]
      if (name === undefined && !i18n[locale]) continue
      if (!name?.trim() || name.length > 128)
        throw new Error('Source Place has no valid inherited name for ' + locale)
      i18n[locale] = { ...i18n[locale], title: name, titleGen: false }
    }
    if ((overrides.phoneNumber?.mode ?? 'inherit') === 'inherit')
      phones = facts.phoneNumber
  } else if ((overrides.location?.mode ?? 'inherit') === 'inherit') {
    const reference = location.address
    if (
      reference.status !== 'resolved' &&
      (reference.address2dId || reference.address3dId || reference.address3dUnitId)
    )
      throw new Error('Canonical address dependencies are unresolved')
    const address = FeatureAddressSchema.parse({
      version: 1,
      source: reference,
      coordinates: location.geometry.coordinates,
      matchStatus: reference.status,
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
  }
  return { data, i18n, phones }
}
