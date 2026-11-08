import { MARKER_STYLE_CODES } from '#lib/features/markerStyle.js'
import { CARD_STYLE_CODES } from '#lib/features/cardStyle.js'
import { CompactAncestorsSchema } from './api'
// I18N
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { layer, layerI18n, layerProperty, userLayer } from '#lib/db/schema/index.js'
// MAP
import { MAP_STYLE_KEYS } from '#lib/map/styles/metadata.js'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints'
import { FormBoolean } from '../form'
import { LayerMetadataSchema } from './layerMetadata'
// ZOD SCHEMAS
import { PropertyAdminProfileAPI } from './property'
import { UserBasic } from './user'

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
//    - LayerRaw
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

export { LayerMetadataSchema } from './layerMetadata'

export const LayerRecord = createSelectSchema(layer)

export const LayerRecordCreate = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: LayerMetadataSchema.prefault({}),
})

export const LayerRecordUpdate = createUpdateSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: LayerMetadataSchema.optional(),
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
  isDefaultVisible: z.boolean(),
})

export const UserLayerRecordUpdate = createUpdateSchema(userLayer)

// ═══════════════════════
// 2. REMOTE FORM SCHEMAS
// ═══════════════════════

export {
  LayerI18nFormData,
  LayerI18nByLocaleFormData,
  LayerPropertyFormData,
  LayerRelocationPolicyFormData,
  LayerEntityFormData,
  LayerFormMeta,
  LayerFormData,
  LayerPreflightFormData,
} from './layer.form'

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishLayerSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  publishChildren: z.boolean().optional(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const RemoveLayerSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

// ═══════════════════════
// 4. REMOTE PROFILE SCHEMAS
// ═══════════════════════

// Legacy selectors remain compatible while callers migrate to resource payload profiles.
export const LayerProfile = z.enum([
  'compact',
  'default',
  'map',
  'full',
  'admin',
  'list',
  'card',
  'detail',
])

const LayerListFields = LayerRecord.pick({
  historicalSourceLayerId: true,
  id: true,
  organisationId: true,
  projectId: true,
  rank: true,
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
  markerStyleCode: z.enum(MARKER_STYLE_CODES).nullable().optional(),
  cardStyleCode: z.enum(CARD_STYLE_CODES).nullable().optional(),
  mapStyleCode: z.enum(MAP_STYLE_KEYS).nullable().optional(),
  i18n: getLocales(LayerI18nRecord),
  properties: z.array(LayerPropertyListProfileAPI).default([]),
})

export const LayerCardProfileAPI = LayerListProfileAPI.extend({
  ancestors: CompactAncestorsSchema.optional(),
  ...LayerCardFields.shape,
})

export const LayerDetailProfileAPI = LayerCardProfileAPI.extend({
  ...LayerDetailFields.shape,
  publisher: UserBasic.nullish(),
})

export const LayerAdminProfileAPI = LayerDetailProfileAPI.extend({
  properties: z.array(LayerPropertyAdminProfileAPI).default([]),
})

export const LayerRaw = LayerRecord.extend({
  i18n: z.array(LayerI18nRecord),
  properties: z.array(LayerPropertyAdminProfileAPI).nullish(),
  publisher: UserBasic.nullish(),
  image: z.unknown().nullish(),
})

/** Minimal identity and action state for paged resource lists. */
export const LayerCompactProfileAPI = LayerRecord.pick({
  id: true,
  isPublished: true,
  isArchived: true,
  modifiedAt: true,
  organisationId: true,
  projectId: true,
  rank: true,
  isDefaultVisible: true,
}).extend({
  markerStyleCode: z.enum(MARKER_STYLE_CODES).nullable().optional(),
  cardStyleCode: z.enum(CARD_STYLE_CODES).nullable().optional(),
  mapStyleCode: z.enum(MAP_STYLE_KEYS).nullable().optional(),
  ancestors: CompactAncestorsSchema.optional(),
  i18n: getLocales(LayerI18nRecord.pick({ name: true, nameShort: true })),
})
