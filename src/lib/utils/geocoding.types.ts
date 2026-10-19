// TYPES
import type { AddressProperties, AddressMeta } from '#lib/utils/address.types.js'
import type { LocaleKey } from '#lib/types.js'

/* ----------------- */
// GEOCODING
/* -------- */

export type ParsedReverseGeocodeResultI18n = {
  displayAddress: string | undefined | null
  displayAddressGen: boolean
  addressProperties: Partial<AddressProperties>
}

// IDENTIFY RESULT
export interface ParsedReverseGeocodeResult {
  addressMeta: AddressMeta
  i18n: Record<LocaleKey, ParsedReverseGeocodeResultI18n>
}
