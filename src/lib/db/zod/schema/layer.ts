// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { layer, layerI18n, layerProperty, userLayer } from '$lib/db/schema/index'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints'
import { FormBoolean } from '../form'
// ZOD SCHEMAS
import { PropertyAdminProfileAPI } from './property'
import { UserBasic } from './user'
// TYPES
import type { LayerMetadata } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DB / RELATIONAL PRIMITIVES
//    - LayerRecord
//    - LayerRecordCreate
//    - LayerRecordUpdate
//    - LayerI18nRecord
//    - LayerI18nRecordCreate
//    - LayerI18nRecordUpdate
//    - LayerPropertyRecord
//    - LayerPropertyRecordCreate
//    - LayerPropertyRecordUpdate
//    - UserLayerRecord
//    - UserLayerRecordCreate
//    - UserLayerRecordUpdate
//
// 2. REMOTE FORM SCHEMAS
//    - LayerI18nFormData
//    - LayerI18nByLocaleFormData
//    - LayerPropertyFormData
//    - LayerEntityFormData
//    - LayerFormMeta
//    - LayerFormData
//    - LayerPreflightFormData
//
// 3. REMOTE COMMAND SCHEMAS
//    - PublishLayerSchema
//    - RemoveLayerSchema
//
// 4. REMOTE PROFILE SCHEMAS
//    - LayerProfile
//    - LayerPropertyListProfileAPI
//    - LayerPropertyAdminProfileAPI
//    - LayerListProfileAPI
//    - LayerCardProfileAPI
//    - LayerDetailProfileAPI
//    - LayerAdminProfileAPI

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const LayerRecord = createSelectSchema(layer)

export const LayerRecordCreate = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().prefault({}),
})

export const LayerRecordUpdate = createUpdateSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().optional(),
})

export const LayerI18nRecord = createSelectSchema(layerI18n)

export const LayerI18nRecordCreate = createInsertSchema(layerI18n)
  .extend({
    ...getDefaultConstraints(layerI18n),
  })
  .omit({
    layerId: true,
  })

export const LayerI18nRecordUpdate = createUpdateSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n),
})

export const LayerPropertyRecord = createSelectSchema(layerProperty)

export const LayerPropertyRecordCreate = createInsertSchema(layerProperty).omit({
  layerId: true,
})

export const LayerPropertyRecordUpdate = createUpdateSchema(layerProperty)

export const UserLayerRecord = createSelectSchema(userLayer)

export const UserLayerRecordCreate = createInsertSchema(userLayer).extend({
  isVisibleOnLoad: z.boolean(),
})

export const UserLayerRecordUpdate = createUpdateSchema(userLayer)

// ═══════════════════════
// 2. REMOTE FORM SCHEMAS
// ═══════════════════════

export const LayerI18nFormData = z.object({
  name: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_name() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  nameShort: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_short_name() }) })
    .max(32, { message: m.admin__validation_short_name_lte_32_chars() }),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  nameGen: FormBoolean.default(false),
  nameShortGen: FormBoolean.default(false),
  descriptionGen: FormBoolean.optional(),
})

export const LayerI18nByLocaleFormData = z.object({
  en: LayerI18nFormData,
  zhHans: LayerI18nFormData,
  zhHant: LayerI18nFormData,
})

export const LayerPropertyFormData = z.object({
  propertyId: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.field_code() }) }),
  isVisible: FormBoolean.default(false),
  isUserContributable: FormBoolean.default(false),
})

export const LayerEntityFormData = z.object({
  organisationId: z.string().optional(),
  projectId: z
    .string({ message: m.field_is_required({ field: 'Project' }) })
    .min(1, { message: m.field_is_required({ field: 'Project' }) }),
  i18n: LayerI18nByLocaleFormData,
  properties: z.array(LayerPropertyFormData).optional(),
  isDefaultVisible: FormBoolean.default(false),
  metadata: z.custom<LayerMetadata>().optional().default({}),
})

export const LayerFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const LayerFormData = z.object({
  meta: LayerFormMeta.optional(),
  data: LayerEntityFormData,
})

export const LayerPreflightFormData = LayerFormData

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishLayerSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveLayerSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

// ═══════════════════════
// 4. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export const LayerProfile = z.enum(['list', 'card', 'detail', 'admin'])

const LayerListFields = LayerRecord.pick({
  id: true,
  organisationId: true,
  projectId: true,
  isDefaultVisible: true,
  createdAt: true,
  modifiedAt: true,
})

const LayerCardFields = LayerRecord.pick({
  isPublished: true,
  isArchived: true,
})

const LayerDetailFields = LayerRecord.pick({
  metadata: true,
  publishedAt: true,
  publisherId: true,
})

export const LayerPropertyListProfileAPI = LayerPropertyRecord

export const LayerPropertyAdminProfileAPI = LayerPropertyRecordUpdate.extend({
  property: PropertyAdminProfileAPI.optional(),
})

export const LayerListProfileAPI = LayerListFields.extend({
  i18n: getLocales(LayerI18nRecord),
  properties: z.array(LayerPropertyListProfileAPI).default([]),
})

export const LayerCardProfileAPI = LayerListProfileAPI.extend({
  ...LayerCardFields.shape,
})

export const LayerDetailProfileAPI = LayerCardProfileAPI.extend({
  ...LayerDetailFields.shape,
  publisher: UserBasic.nullish(),
})

export const LayerAdminProfileAPI = LayerDetailProfileAPI.extend({
  properties: z.array(LayerPropertyAdminProfileAPI).default([]),
})
