// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  property,
  projectProperty,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '$lib/db/schema/index'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints'
import { FormBoolean } from '../form'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DB / RELATIONAL PRIMITIVES
//    - PropertyRecord
//    - ProjectPropertyRecord
//    - PropertyRecordCreate
//    - PropertyRecordUpdate
//    - PropertyI18nRecord
//    - PropertyI18nRecordCreate
//    - PropertyI18nRecordUpdate
//    - PropertyValueRecord
//    - PropertyValueRecordCreate
//    - PropertyValueRecordUpdate
//    - PropertyValueI18nRecord
//    - PropertyValueI18nRecordCreate
//    - PropertyValueI18nRecordUpdate
//
// 2. REMOTE PROFILE SCHEMAS
//    - PropertyValueProfile
//    - PropertyValueDetailProfileAPI
//    - PropertyValueAdminProfileAPI
//    - PropertyProfile
//    - PropertyDetailProfileAPI
//    - PropertyAdminProfileAPI
//
// 3. REMOTE FORM SCHEMAS
//    - PropertyI18nFormData
//    - PropertyI18nByLocaleFormData
//    - PropertyValueI18nFormData
//    - PropertyValueI18nByLocaleFormData
//    - ProjectPropertyValueFormData
//    - ProjectPropertyFormData
//
// 4. REMOTE FUNCTION SCHEMAS
//    - ProjectPropertiesQuery
//    - ProjectPropertiesFormMeta
//    - ProjectPropertiesFormEntity
//    - ProjectPropertiesFormData

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

const PROPERTY_KEY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const RANGE_FIELD_COMPONENT = 'RangeField'

const withRangeFieldBoundsRequirement = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
): TSchema =>
  schema.superRefine((value: unknown, ctx) => {
    if (!value || typeof value !== 'object') return

    const record = value as {
      component?: unknown
      min?: unknown
      max?: unknown
    }

    if (record.component !== RANGE_FIELD_COMPONENT) return

    if (record.min === undefined || record.min === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: m.field_is_required({ field: m.admin__forms_property_minimum() }),
      })
    }

    if (record.max === undefined || record.max === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: m.field_is_required({ field: m.admin__forms_property_maximum() }),
      })
    }
  }) as TSchema

export const PropertyRecord = createSelectSchema(property)
export const ProjectPropertyRecord = createSelectSchema(projectProperty)

export const PropertyRecordCreate = withRangeFieldBoundsRequirement(
  createInsertSchema(property).extend({
    ...getDefaultConstraints(property),
    key: z
      .string()
      .min(1, { message: m.field_is_required({ field: m.field_code() }) })
      .regex(PROPERTY_KEY_IDENTIFIER_REGEX, {
        message: m.admin__validation_key_valid_characters(),
      }),
    type: z.string().min(1),
    component: z.string().min(1),
    min: z.coerce.number().int().nullish(),
    max: z.coerce.number().int().nullish(),
  }),
)

export const PropertyRecordUpdate = createUpdateSchema(property).extend({
  ...getDefaultConstraints(property),
  key: z
    .string()
    .regex(PROPERTY_KEY_IDENTIFIER_REGEX, {
      message: m.admin__validation_key_valid_characters(),
    })
    .optional(),
  type: z.string().min(1),
  component: z.string().min(1),
  min: z.coerce.number().int().nullish(),
  max: z.coerce.number().int().nullish(),
})

export const PropertyValueRecord = createSelectSchema(propertyValue)
export const PropertyValueRecordCreate = createInsertSchema(propertyValue)
export const PropertyValueRecordUpdate = createUpdateSchema(propertyValue)

export const PropertyI18nRecord = createSelectSchema(propertyI18n)
export const PropertyI18nRecordCreate = createInsertSchema(propertyI18n).extend({
  ...getDefaultConstraints(propertyI18n),
  labelGen: FormBoolean.optional(),
  placeholderGen: FormBoolean.optional(),
})
export const PropertyI18nRecordUpdate = createUpdateSchema(propertyI18n).extend({
  ...getDefaultConstraints(propertyI18n),
  labelGen: FormBoolean.optional(),
  placeholderGen: FormBoolean.optional(),
})

export const PropertyValueI18nRecord = createSelectSchema(propertyValueI18n)
export const PropertyValueI18nRecordCreate = createInsertSchema(
  propertyValueI18n,
).extend({
  valueGen: FormBoolean.optional(),
})
export const PropertyValueI18nRecordUpdate = createUpdateSchema(
  propertyValueI18n,
).extend({
  valueGen: FormBoolean.optional(),
})

export const PropertyValueRawRecord = PropertyValueRecord.extend({
  i18n: z.array(PropertyValueI18nRecord).nullish(),
})

export const PropertyRecordRaw = PropertyRecord.extend({
  i18n: z.array(PropertyI18nRecord),
  values: z.array(PropertyValueRawRecord).nullish(),
})

// ═══════════════════════
// 2. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export const PropertyValueProfile = z.enum(['detail', 'admin'])

export const PropertyValueDetailProfileAPI = PropertyValueRecord.extend({
  i18n: getLocales(PropertyValueI18nRecord).nullish(),
})

export const PropertyValueAdminProfileAPI = PropertyValueDetailProfileAPI

export const PropertyProfile = z.enum(['detail', 'admin'])

export const PropertyDetailProfileAPI = PropertyRecord.extend({
  rank: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  i18n: getLocales(PropertyI18nRecord),
  values: z.array(PropertyValueDetailProfileAPI).nullish(),
})

export const PropertyAdminProfileAPI = PropertyRecord.extend({
  rank: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  i18n: getLocales(PropertyI18nRecord),
  values: z.array(PropertyValueAdminProfileAPI).nullish(),
})

// ═══════════════════════
// 3. REMOTE FORM SCHEMAS
// ═══════════════════════

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
  value: z.string().optional(),
  i18n: PropertyValueI18nByLocaleFormData.optional(),
})

export const ProjectPropertyFormData = withRangeFieldBoundsRequirement(
  z.object({
    id: z.string().optional(),
    scope: z.enum(['hub', 'organisation', 'project']).default('project'),
    hubId: z.string().nullish().optional(),
    organisationId: z.string().nullish().optional(),
    projectId: z.string().optional(),
    isEnabled: FormBoolean.default(true),
    isDefaultEnabled: FormBoolean.default(false),
    type: z.string().min(1).optional(),
    isTranslatable: FormBoolean.optional(),
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
  }),
)

// ═══════════════════════
// 4. REMOTE FUNCTION SCHEMAS
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
