// SHARED ADDRESS CONTRACT
import { parseAddressContent } from '@saanseoi/address'
import {
  LocalAddressI18nSchema,
  LocalLocationAddressSchema,
} from './localLocationAddress'
import type { LocalLocationAddress } from './localLocationAddress'
// FEATURE ADDRESS
import { ADDRESS_LOCALES, getAddressDisplay, getAddressLocale } from './featureAddress'
import type { FeatureAddress } from './featureAddress'

/** Copy geocoded content into a locally authored proposal without claiming canonical IDs.
 * @param original Current Feature address, including unit details and original text.
 * @param geocoded Optional explicitly selected geocoder result.
 * @returns Editable SaanSeoi-compatible content; original unit evidence is preserved.
 */
export function prepareLocalLocationAddress(
  original: FeatureAddress,
  geocoded?: FeatureAddress,
): LocalLocationAddress {
  const labels = Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
      tag,
      getAddressDisplay(original, locale as keyof typeof ADDRESS_LOCALES),
    ]),
  )
  const content = original.source.authored
    ? structuredClone(original.source.authored)
    : parseAddressContent(labels).content
  if (!geocoded) return content
  const record = geocoded.source.records.data
  const attributes =
    record && typeof record === 'object' && 'attributes' in record
      ? record.attributes
      : undefined
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    const candidate = Object.fromEntries(
      Object.entries(attributes).filter(
        ([key]) =>
          key in LocalLocationAddressSchema.shape &&
          !['i18n', 'unit', 'unitI18n'].includes(key),
      ),
    )
    const validated = LocalLocationAddressSchema.safeParse({ ...content, ...candidate })
    if (validated.success) Object.assign(content, validated.data)
  }
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const source = getAddressLocale(geocoded, locale as keyof typeof ADDRESS_LOCALES)
    const row = Object.fromEntries(
      Object.keys(LocalAddressI18nSchema.shape)
        .filter(key => key in source)
        .map(key => [key, source[key as keyof typeof source]]),
    )
    const parsed = LocalAddressI18nSchema.safeParse(row)
    if (parsed.success) content.i18n[tag] = parsed.data
  }
  return content
}
