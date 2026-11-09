// VALIDATION
import { z } from 'zod'
// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  type FeatureAddress,
} from './featureAddress'
import { setAddressExpression } from './addressExpressions'

const villageAddress = z.object({
  attributes: z.object({
    hamletId: z.string().min(1).optional(),
    sources: z.array(z.object({ publisher: z.string() })),
    i18n: z.object({ en: z.object({ formattedAddress: z.string() }) }),
  }),
  relationships: z
    .object({
      divisions: z
        .object({
          data: z.array(z.object({ meta: z.object({ role: z.string() }).optional() })),
        })
        .optional(),
    })
    .optional(),
})

/** Recover a literal village number omitted from a selected DPO record's structured fields.
 * @param address Geocoded or explicitly selected source address.
 * @returns An editable number override, with the source record and pin untouched.
 * @remarks Only one standalone comma-separated numeric token is accepted, and only
 * for DPO village addresses. Village names are never interpreted as street names.
 * Existing structured numbers and manual corrections take precedence.
 */
export function recoverAddressNumber(address: FeatureAddress): FeatureAddress {
  if (
    Object.keys(ADDRESS_LOCALES).some(locale => {
      const fields = getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES)
      const overrides =
        address.overrides[ADDRESS_LOCALES[locale as keyof typeof ADDRESS_LOCALES]]
      return (
        fields.buildingNumberExpression ||
        fields.buildingNumberFrom ||
        fields.buildingNumberTo ||
        Object.hasOwn(overrides ?? {}, 'buildingNumberExpression')
      )
    })
  )
    return address
  const source = villageAddress.safeParse(address.source.rawSource.data)
  if (
    !source.success ||
    !source.data.attributes.sources.some(row => row.publisher === 'hkgov-dpo')
  )
    return address
  if (
    !source.data.attributes.hamletId &&
    !source.data.relationships?.divisions?.data.some(row => row.meta?.role === 'hamlet')
  )
    return address
  const tokens = source.data.attributes.i18n.en.formattedAddress
    .split(',')
    .map(value => value.trim())
  const numbers = tokens.filter(value =>
    /^\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?$/.test(value),
  )
  if (numbers.length !== 1) return address
  return setAddressExpression(address, 'en', 'buildingNumberExpression', numbers[0])
}
