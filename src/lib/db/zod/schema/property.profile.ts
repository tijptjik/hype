import { automaticTranslationReadFields } from '#lib/i18n/automaticSchema.js'
// ZOD
import { z } from 'zod'
// DOMAIN
import { contentLocaleMap, ContentTagInput } from '#lib/i18n/contentRecords.js'
import { FieldDiscriminator, PropertyComponentType, PropertyScope } from '#lib/enums.js'
import { valueContract } from './property.form'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SHARED RECORD CONTRACTS
// 2. PROPERTY PROFILES
// ---

// These read contracts are shared by server profiles, forms and CSV import.
const storedInteger = z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER)
const propertyComponent = z.enum(
  Object.values(PropertyComponentType) as [string, ...string[]],
)
export const PropertyRecord = z.object({
  id: z.string(),
  organisationId: z.string().nullable(),
  hubId: z.string().nullable(),
  projectId: z.string().nullable(),
  scope: z.enum(Object.values(PropertyScope) as [string, ...string[]]),
  type: z.enum(Object.values(FieldDiscriminator) as [string, ...string[]]),
  key: z.string(),
  dataType: valueContract.dataType,
  dateResolution: valueContract.dateResolution,
  timeMaxHour: valueContract.timeMaxHour,
  cardinality: valueContract.cardinality,
  presentation: valueContract.presentation,
  audience: valueContract.audience,
  // Older ELN imports used TextField for the canonical single-line InputField.
  component: z.preprocess(
    value => (value === 'TextField' ? 'InputField' : value),
    propertyComponent,
  ),
  min: storedInteger.nullable(),
  max: storedInteger.nullable(),
  isTranslatable: z.boolean(),
  isUserContributable: z.boolean(),
  isDefaultEnabled: z.boolean(),
  createdAt: z.string(),
  modifiedAt: z.string(),
})
export const PropertyValueRecord = z.object({
  id: z.string(),
  propertyId: z.string(),
  rank: storedInteger,
  icon: z.string().nullish(),
  value: z.string().nullable(),
})
export const PropertyI18nRecord = z.object({
  ...automaticTranslationReadFields,
  propertyId: z.string(),
  locale: ContentTagInput,
  label: z.string(),
  labelGen: z.boolean(),
  placeholder: z.string().nullable(),
  placeholderGen: z.boolean(),
})
export const PropertyValueI18nRecord = z.object({
  ...automaticTranslationReadFields,
  propertyValueId: z.string(),
  locale: ContentTagInput,
  value: z.string(),
  valueGen: z.boolean(),
})

// ═══════════════════════
// 2. PROPERTY PROFILES
// ═══════════════════════

export const PropertyValueProfile = z.enum(['detail', 'admin'])

export const PropertyValueDetailProfileAPI = PropertyValueRecord.extend({
  i18n: contentLocaleMap(PropertyValueI18nRecord).nullish(),
})

export const PropertyValueAdminProfileAPI = PropertyValueDetailProfileAPI

export const PropertyProfile = z.enum(['detail', 'admin'])

export const PropertyDetailProfileAPI = PropertyRecord.extend({
  rank: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  i18n: contentLocaleMap(PropertyI18nRecord),
  values: z.array(PropertyValueDetailProfileAPI).nullish(),
})

export const PropertyAdminProfileAPI = PropertyRecord.extend({
  rank: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  i18n: contentLocaleMap(PropertyI18nRecord),
  values: z.array(PropertyValueAdminProfileAPI).nullish(),
})
