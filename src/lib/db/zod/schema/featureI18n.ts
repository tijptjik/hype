// ZOD
import { z } from 'zod'
// LOCALES
import { ContentTagInput } from '#lib/i18n/contentRecords.js'
// TYPES
import type { AddressProperties } from '#lib/utils/address.types.js'

/** Persisted translations shared by read profiles and CSV import normalization. */
export const FeatureI18nBase = z.object({
  featureId: z.string(),
  locale: ContentTagInput,
  baseName: z.string().nullish(),
  nameOverride: z.string().nullish(),
  title: z.string(),
  titleGen: z.boolean(),
  description: z.string().nullable(),
  descriptionGen: z.boolean(),
  displayAddress: z.string().nullable(),
  displayAddressGen: z.boolean(),
  addressProperties: z.custom<AddressProperties>().nullish(),
})
