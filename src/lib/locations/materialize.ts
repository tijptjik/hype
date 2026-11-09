// CONTENT LOCALES
import { adaptContentMap, contentStorageTag } from '#lib/i18n/contentRecords.js'
// ADDRESS
import {
  ADDRESS_LOCALES,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
// DOMAIN
import { resolveFeatureLocation } from './resolve'
// TYPES
import type { FeatureLocationOverrides, LocationFacts } from './model'
import type {
  FeatureDBPartial,
  FeatureI18nPartial,
} from '#lib/db/zod/schema/feature.types.js'

/** Materialize accepted baseline and Organisation corrections into queryable Feature fields.
 * @param input Independently accepted baseline groups, corrections and current Feature-specific data.
 * @returns Effective projection and ordered phone values; role-specific descriptions are retained.
 */
export function materializeEffectiveLocation(input: {
  fieldGroup?: 'facts' | 'location'
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
  const effective = resolveFeatureLocation(
    { ...input.facts, names: adaptContentMap(input.facts.names, contentStorageTag) },
    input.locationFacts.location,
    {
      ...input.overrides,
      names: adaptContentMap(input.overrides.names ?? {}, contentStorageTag),
    },
  )
  if (!effective.location) throw new Error('A Feature requires Location coordinates')
  const retainedAddress = FeatureAddressSchema.safeParse(
    input.data.addressMeta?.address,
  )
  const independentPlacement =
    retainedAddress.success && Boolean(retainedAddress.data.association)
  const address =
    independentPlacement && retainedAddress.success
      ? retainedAddress.data
      : FeatureAddressSchema.parse({
          version: 1,
          source: effective.location.address,
          coordinates: effective.location.geometry.coordinates,
          matchStatus: effective.location.address.status,
          overrides: {},
        })
  const i18n = adaptContentMap(structuredClone(input.i18n))
  const names = adaptContentMap(effective.names)
  if (input.fieldGroup !== 'location')
    for (const locale of new Set([...Object.keys(i18n), ...Object.keys(names)])) {
      const title = names[locale]
      if (title === undefined && !i18n[locale]) continue
      i18n[locale] = { ...i18n[locale], title: title ?? '', titleGen: false }
    }
  if (input.fieldGroup !== 'facts')
    for (const locale of Object.keys(i18n).filter(locale => locale in ADDRESS_LOCALES))
      i18n[locale] = {
        ...i18n[locale],
        displayAddress: getAddressDisplay(
          address,
          locale as keyof typeof ADDRESS_LOCALES,
          [],
          input.facts.entity?.kind,
        ),
        displayAddressGen: input.facts.entity?.kind === 'building',
        addressProperties: {},
      }
  return {
    data:
      input.fieldGroup === 'facts'
        ? input.data
        : {
            ...input.data,
            geometry: independentPlacement
              ? (input.data.geometry ?? effective.location.geometry)
              : effective.location.geometry,
            addressMeta: { ...input.data.addressMeta, address },
          },
    i18n,
    phones: input.fieldGroup === 'location' ? undefined : (effective.phoneNumber ?? []),
  }
}
