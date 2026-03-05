// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// CONSTRAINTS
import { FormBoolean } from '../form'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. REMOTE FORM SCHEMAS
//    - PropertyI18nFormData
//    - PropertyI18nByLocaleFormData
//    - PropertyValueI18nFormData
//    - PropertyValueI18nByLocaleFormData
//    - ProjectPropertyValueFormData
//    - ProjectPropertyFormData
//
// 2. REMOTE FUNCTION SCHEMAS
//    - ProjectPropertiesQuery
//    - ProjectPropertiesFormMeta
//    - ProjectPropertiesFormEntity
//    - ProjectPropertiesFormData

// ═══════════════════════
// 1. REMOTE FORM SCHEMAS
// ═══════════════════════

const PROPERTY_KEY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

export const PropertyI18nFormData = z.object({
  label: z
    .string()
    .min(1, {
      message: m.field_is_required({ field: m.field_label() }),
    })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  labelGen: FormBoolean.default(false),
  placeholder: z
    .string()
    .max(128, { message: m.admin__validation_lte_128_chars() })
    .optional(),
  placeholderGen: FormBoolean.default(false),
})

export const PropertyI18nByLocaleFormData = z.object({
  en: PropertyI18nFormData,
  zhHans: PropertyI18nFormData,
  zhHant: PropertyI18nFormData,
})

export const PropertyValueI18nFormData = z.object({
  value: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_value() }) }),
  valueGen: FormBoolean.default(false),
})

export const PropertyValueI18nByLocaleFormData = z.object({
  en: PropertyValueI18nFormData,
  zhHans: PropertyValueI18nFormData,
  zhHant: PropertyValueI18nFormData,
})

export const ProjectPropertyValueFormData = z.object({
  id: z.string().optional(),
  propertyId: z.string().optional(),
  rank: z.coerce.number().int().optional(),
  i18n: PropertyValueI18nByLocaleFormData,
})

export const ProjectPropertyFormData = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  type: z.string().min(1),
  isTranslatable: z.coerce.boolean<boolean>().optional(),
  key: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) })
    .regex(PROPERTY_KEY_IDENTIFIER_REGEX, {
      message: m.admin__validation_key_valid_characters(),
    }),
  rank: z.coerce.number().int().optional(),
  component: z.string().min(1),
  min: z.coerce.number().int().nullish(),
  max: z.coerce.number().int().nullish(),
  values: z.array(ProjectPropertyValueFormData).nullish(),
  i18n: PropertyI18nByLocaleFormData,
})

// ═══════════════════════
// 2. REMOTE FUNCTION SCHEMAS
// ═══════════════════════

export const ProjectPropertiesQuery = z.object({
  projectId: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const ProjectPropertiesFormMeta = z.object({
  projectId: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const ProjectPropertiesFormEntity = z.object({
  projectId: z.string().min(1).optional(),
  properties: z.array(ProjectPropertyFormData),
})

export const ProjectPropertiesFormData = z.object({
  meta: ProjectPropertiesFormMeta.optional(),
  data: ProjectPropertiesFormEntity,
})
