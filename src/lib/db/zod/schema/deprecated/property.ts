// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '$lib/db/schema/index'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../../constraints'
import { FormBoolean } from '../../form'

const PROPERTY_KEY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

/* ----------------- */
// PROPERTY CORE SCHEMAS
/* -------- */

export const PropertyBase = createSelectSchema(property)
export const PropertyInsert = createInsertSchema(property).extend({
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
})
export const PropertyUpdate = createUpdateSchema(property).extend({
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

/* ----------------- */
// PROPERTY VALUE SCHEMAS
/* -------- */

export const PropertyValueBase = createSelectSchema(propertyValue)
export const PropertyValueInsert = createInsertSchema(propertyValue)
export const PropertyValueUpdate = createUpdateSchema(propertyValue)

/* ----------------- */
// PROPERTY RELATIONAL SCHEMAS
/* -------- */

export const PropertyI18nBase = createSelectSchema(propertyI18n)
export const PropertyI18nInsert = createInsertSchema(propertyI18n).extend({
  ...getDefaultConstraints(propertyI18n),
  labelGen: FormBoolean.optional(),
  placeholderGen: FormBoolean.optional(),
})
export const PropertyI18nUpdate = createUpdateSchema(propertyI18n).extend({
  ...getDefaultConstraints(propertyI18n),
  labelGen: FormBoolean.optional(),
  placeholderGen: FormBoolean.optional(),
})

export const PropertyValueI18nBase = createSelectSchema(propertyValueI18n)
export const PropertyValueI18nInsert = createInsertSchema(propertyValueI18n).extend({
  valueGen: FormBoolean.optional(),
})
export const PropertyValueI18nUpdate = createUpdateSchema(propertyValueI18n).extend({
  valueGen: FormBoolean.optional(),
})

/* ----------------- */
// PROPERTY API SCHEMAS
/* -------- */

export const PropertyValueAPI = PropertyValueBase.extend({
  i18n: getLocales(PropertyValueI18nBase),
})

export const PropertyValueInsertAPI = PropertyValueInsert.extend({
  i18n: getLocales(PropertyValueI18nInsert),
})

export const PropertyValueUpdateAPI = PropertyValueUpdate.extend({
  i18n: getLocales(PropertyValueI18nUpdate),
})

export const PropertyAPI = PropertyBase.extend({
  i18n: getLocales(PropertyI18nBase),
  values: z.array(PropertyValueAPI).nullish(),
})

export const PropertyInsertAPI = PropertyInsert.extend({
  i18n: getLocales(PropertyI18nInsert),
  values: z.array(PropertyValueInsertAPI).nullish(),
  type: z.string().min(1),
  component: z.string().min(1),
  min: z.coerce.number().int().nullish(),
  max: z.coerce.number().int().nullish(),
})

export const PropertyUpdateAPI = PropertyUpdate.extend({
  i18n: getLocales(PropertyI18nUpdate),
  values: z.array(PropertyValueUpdateAPI).nullish(),
  type: z.string().min(1),
  component: z.string().min(1),
  min: z.coerce.number().int().nullish(),
  max: z.coerce.number().int().nullish(),
})

/* ----------------- */
// PROPERTY INTERMEDIATE SCHEMAS
/* -------- */

export const PropertyValueRaw = PropertyValueBase.extend({
  i18n: z.array(PropertyValueI18nBase).nullish(),
})

export const PropertyBaseRaw = PropertyBase.extend({
  i18n: z.array(PropertyI18nBase),
  values: z.array(PropertyValueRaw),
})
