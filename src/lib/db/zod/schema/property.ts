// SHARED READ CONTRACTS
import {
  PropertyRecord,
  PropertyValueRecord,
  PropertyI18nRecord,
  PropertyValueI18nRecord,
} from './property.profile'
export {
  PropertyRecord,
  PropertyValueRecord,
  PropertyI18nRecord,
  PropertyValueI18nRecord,
  PropertyValueProfile,
  PropertyValueDetailProfileAPI,
  PropertyValueAdminProfileAPI,
  PropertyProfile,
  PropertyDetailProfileAPI,
  PropertyAdminProfileAPI,
} from './property.profile'
// I18N
import { m } from '#lib/i18n.js'
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
} from '#lib/db/schema/index.js'
import {
  valueContract,
  PROPERTY_KEY_IDENTIFIER_REGEX,
  withPropertyFieldRequirements,
} from './property.form'
// CONSTRAINTS
import { getDefaultConstraints } from '../constraints'
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

export const ProjectPropertyRecord = createSelectSchema(projectProperty)

export const PropertyRecordCreate = withPropertyFieldRequirements(
  createInsertSchema(property).extend({
    ...getDefaultConstraints(property),
    ...valueContract,
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

export const PropertyRecordUpdate = withPropertyFieldRequirements(
  createUpdateSchema(property).extend({
    ...getDefaultConstraints(property),
    ...valueContract,
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
  }),
  false,
)

export const PropertyValueRecordCreate = createInsertSchema(propertyValue)
export const PropertyValueRecordUpdate = createUpdateSchema(propertyValue)

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

// ═══════════════════════
// 3. REMOTE FORM SCHEMAS
// ═══════════════════════

export {
  PropertyI18nFormData,
  PropertyI18nByLocaleFormData,
  PropertyValueI18nFormData,
  PropertyValueI18nByLocaleFormData,
  ProjectPropertyValueFormData,
  ProjectPropertyFormData,
  ProjectPropertiesQuery,
  ProjectPropertiesFormMeta,
  ProjectPropertiesFormEntity,
  ProjectPropertiesFormData,
} from './property.form'
