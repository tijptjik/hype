// CONTENT LOCALES
import { adaptContentMap } from '#lib/i18n/contentRecords.js'
// DOMAIN
import {
  ADDRESS_LOCALES,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { FeatureLocationOverridesSchema, LocationFactsSchema } from './validation'
// TYPES
import type { FeatureLocationOverrides, LocationFacts } from './model'
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
export function materializeLocationAdoption(input: {
  fieldGroup: 'facts' | 'location'
  facts: LocationFacts
  locationFacts: LocationFacts
  overrides: FeatureLocationOverrides
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
}): {
  data: FeatureDBPartial
  i18n: Record<string, FeatureI18nPartial>
  phones?: string[]
} {
  const facts = LocationFactsSchema.parse(input.facts)
  const location = LocationFactsSchema.parse(input.locationFacts).location
  const overrides = FeatureLocationOverridesSchema.parse(input.overrides)
  const data = structuredClone(input.data)
  const i18n = adaptContentMap(structuredClone(input.i18n))
  let phones: string[] | undefined
  if (input.fieldGroup === 'facts') {
    const names = adaptContentMap(facts.names)
    const nameOverrides = adaptContentMap(overrides.names ?? {})
    for (const locale of new Set([...Object.keys(i18n), ...Object.keys(names)])) {
      if ((nameOverrides[locale]?.mode ?? 'inherit') !== 'inherit') continue
      const name = names[locale]
      if (name === undefined && !i18n[locale]) continue
      if (name !== undefined && name.length > 128)
        throw new Error('Source Location has no valid inherited name for ' + locale)
      i18n[locale] = { ...i18n[locale], title: name ?? '', titleGen: false }
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
        displayAddress: getAddressDisplay(address, locale, [], facts.entity?.kind),
        displayAddressGen: true,
        addressProperties: {},
      }
    }
  }
  return { data, i18n, phones }
}
