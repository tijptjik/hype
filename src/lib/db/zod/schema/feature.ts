// I18N
import { m } from '$lib/i18n'
// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  userFeature,
} from '$lib/db/schema/index'
// CONSTRAINTS
import { getLocales } from '../constraints'
import { FormBoolean } from '../form'
// ZOD SCHEMAS
import {
  PropertyAdminProfileAPI,
  PropertyDetailProfileAPI,
  PropertyValueAdminProfileAPI,
  PropertyValueDetailProfileAPI,
} from './property'
import { ImageContextEnvelopeAPI } from './image'
import { UserBasic } from './user'
// ENUMS
import { supportedLocales } from '$lib/enums'
// TYPES
import type { AddressMeta, AddressProperties } from '$lib/types'
import type { GeometryObject } from 'geojson'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DB / RELATIONAL PRIMITIVES
//    - FeatureBase
//    - FeatureInsert
//    - FeatureUpdate
//    - FeatureI18nBase
//    - FeatureI18nInsert
//    - FeatureI18nUpdate
//    - FeaturePropertyBase
//    - FeaturePropertyInsert
//    - FeaturePropertyUpdate
//    - FeaturePropertyI18nBase
//    - FeaturePropertyI18nInsert
//    - FeaturePropertyI18nUpdate
//    - UserFeatureBase
//    - UserFeatureInsert
//    - UserFeatureUpdate
//    - FeatureListRow
//    - FeatureCardRow
//    - FeatureAdminRow
//
// 2. REMOTE FORM SCHEMAS
//    - FeatureI18nFormData
//    - FeaturePropertyI18nFormData
//    - FeaturePropertyI18nByLocaleFormData
//    - FeaturePropertyFormData
//    - FeatureI18nByLocaleFormData
//    - FeatureEntityFormData
//    - FeatureFormMeta
//    - FeatureFormData
//    - FeaturePreflightFormData
//
// 3. REMOTE COMMAND SCHEMAS
//    - PublishFeatureSchema
//    - RemoveFeatureSchema
//
// 4. REMOTE PROFILE SCHEMAS
//    - FeatureProfile
//    - FeaturePropertyCollectionAPI
//    - FeaturePropertyAPI
//    - FeatureListProfileAPI
//    - FeatureCardProfileAPI
//    - FeatureDetailProfileAPI
//    - FeatureAdminProfileAPI

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const FeatureBase = createSelectSchema(feature).extend({
  geometry: z.custom<GeometryObject>(),
  addressMeta: z.custom<AddressMeta>().default({}),
})

export const FeatureInsert = createInsertSchema(feature).extend({
  geometry: z.custom<GeometryObject>().prefault({
    type: 'Point',
    coordinates: [114.1693671540923, 22.319307515052614],
  }),
  addressMeta: z.custom<AddressMeta>().prefault({}),
  isPublished: FormBoolean.default(false),
  isPendingReview: FormBoolean.default(false),
  isArchived: FormBoolean.default(false),
  isIntangible: FormBoolean.default(false),
  isVisitable: FormBoolean.default(true),
})

export const FeatureUpdate = createUpdateSchema(feature).extend({
  geometry: z.custom<GeometryObject>().optional(),
  addressMeta: z.custom<AddressMeta>().optional(),
  isPublished: FormBoolean.optional(),
  isPendingReview: FormBoolean.optional(),
  isArchived: FormBoolean.optional(),
  isIntangible: FormBoolean.optional(),
  isVisitable: FormBoolean.optional(),
})

export const FeatureI18nBase = createSelectSchema(featureI18n).extend({
  locale: z.enum(Object.values(supportedLocales) as [string, ...string[]]),
  addressProperties: z.custom<AddressProperties>().nullish(),
})

export const FeatureI18nInsert = createInsertSchema(featureI18n)
  .omit({
    featureId: true,
    locale: true,
  })
  .extend({
    addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
    titleGen: FormBoolean.default(false),
    descriptionGen: FormBoolean.default(false),
    displayAddressGen: FormBoolean.default(false),
  })

export const FeatureI18nUpdate = createUpdateSchema(featureI18n)
  .omit({
    featureId: true,
    locale: true,
  })
  .extend({
    addressProperties: z.custom<AddressProperties>().nullish(),
    titleGen: FormBoolean.optional(),
    descriptionGen: FormBoolean.optional(),
    displayAddressGen: FormBoolean.optional(),
  })

export type FeatureI18nFieldKeys = keyof z.infer<typeof FeatureI18nInsert>

export const FeaturePropertyBase = createSelectSchema(featureProperty).extend({
  // value can be string, number, boolean, or null. Zod schema should reflect this.
  // For simplicity, keeping as string().nullable() but this might need to be z.any() or a union for more flexibility if type is not always string.
  value: z.string().nullish(),
  propertyValueId: z.string().nullish(),
})

export const FeaturePropertyInsert = createInsertSchema(featureProperty)
  .omit({
    featureId: true,
  })
  .extend({
    value: z.string().nullish(),
    propertyValueId: z.string().nullish(),
  })

export const FeaturePropertyUpdate = createUpdateSchema(featureProperty)
  .omit({
    featureId: true,
  })
  .extend({
    value: z.string().nullish(),
    propertyValueId: z.string().nullish(),
  })

export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n).extend({
  locale: z.enum(Object.values(supportedLocales) as [string, ...string[]]),
  valueGen: FormBoolean.optional(),
})

export const FeaturePropertyI18nInsert = createInsertSchema(featurePropertyI18n)
  .omit({
    featureId: true,
    propertyId: true,
    locale: true,
  })
  .extend({
    valueGen: FormBoolean.default(false),
  })

export const FeaturePropertyI18nUpdate = createUpdateSchema(featurePropertyI18n)
  .omit({
    featureId: true,
    propertyId: true,
    locale: true,
  })
  .extend({
    valueGen: FormBoolean.optional(),
  })

export const UserFeatureBase = createSelectSchema(userFeature)
export const UserFeatureInsert = createInsertSchema(userFeature)
export const UserFeatureUpdate = createUpdateSchema(userFeature)

export const FeatureListRow = FeatureBase.extend({
  i18n: z.array(FeatureI18nBase).nullish(),
  properties: z
    .array(
      FeaturePropertyBase.extend({
        i18n: z.array(FeaturePropertyI18nBase).nullish(),
        property: PropertyDetailProfileAPI.optional(),
        propertyValue: PropertyValueDetailProfileAPI.nullish(),
      }),
    )
    .nullish(),
  image: z.unknown().nullish(),
  imageCount: z.number().int().default(0),
  imagePublishedCount: z.number().int().default(0),
})

export const FeatureCardRow = FeatureListRow.extend({
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  images: z.array(z.unknown()).nullish(),
})

export const FeatureAdminRow = FeatureBase.extend({
  i18n: z.array(FeatureI18nBase).nullish(),
  properties: z
    .array(
      FeaturePropertyBase.extend({
        i18n: z.array(FeaturePropertyI18nBase).nullish(),
        property: PropertyAdminProfileAPI.optional(),
        propertyValue: PropertyValueAdminProfileAPI.nullish(),
      }),
    )
    .nullish(),
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  image: z.unknown().nullish(),
  images: z.array(z.unknown()).nullish(),
})

// ═══════════════════════
// 2. REMOTE FORM SCHEMAS
// ═══════════════════════

export const FeatureI18nFormData = z.object({
  title: z
    .string()
    .min(1, { message: m.field_is_required({ field: m.feature__title() }) })
    .max(128, { message: m.admin__validation_lte_128_chars() }),
  titleGen: FormBoolean.default(false),
  description: z
    .string()
    .max(8192, { message: m.admin__validation_description_lte_8192_chars() })
    .optional(),
  descriptionGen: FormBoolean.default(false),
  displayAddress: z
    .string()
    .max(512, { message: m.admin__validation_lte_128_chars() })
    .optional(),
  displayAddressGen: FormBoolean.default(false),
  addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
})

export const FeaturePropertyI18nFormData = z.object({
  value: z.string().optional(),
  valueGen: FormBoolean.default(false),
})

export const FeaturePropertyI18nByLocaleFormData = z.object({
  en: FeaturePropertyI18nFormData.optional().default({ valueGen: false }),
  zhHans: FeaturePropertyI18nFormData.optional().default({ valueGen: false }),
  zhHant: FeaturePropertyI18nFormData.optional().default({ valueGen: false }),
})

export const FeaturePropertyFormData = z.object({
  propertyId: z.string().min(1),
  value: z.string().optional().nullable(),
  propertyValueId: z.string().optional().nullable(),
  i18n: FeaturePropertyI18nByLocaleFormData.optional(),
  property: PropertyAdminProfileAPI.optional(),
  propertyValue: PropertyValueAdminProfileAPI.nullish(),
})

export const FeatureI18nByLocaleFormData = z.object({
  en: FeatureI18nFormData,
  zhHans: FeatureI18nFormData,
  zhHant: FeatureI18nFormData,
})

export const FeatureEntityFormData = z.object({
  organisationId: z
    .string({ message: m.field_is_required({ field: m.field_organisation() }) })
    .min(1, { message: m.field_is_required({ field: m.field_organisation() }) }),
  projectId: z
    .string({ message: m.field_is_required({ field: 'Project' }) })
    .min(1, { message: m.field_is_required({ field: 'Project' }) }),
  layerId: z
    .string({ message: m.field_is_required({ field: 'Layer' }) })
    .min(1, { message: m.field_is_required({ field: 'Layer' }) }),
  contributorId: z.string().optional().nullable(),
  geometry: z.custom<GeometryObject>(),
  addressMeta: z.custom<AddressMeta>().prefault({}).nullish(),
  isIntangible: FormBoolean.default(false),
  isVisitable: FormBoolean.default(true),
  isPendingReview: FormBoolean.default(false),
  i18n: FeatureI18nByLocaleFormData,
  properties: z.array(FeaturePropertyFormData).default([]),
})

export const FeatureFormMeta = z.object({
  id: z.string().optional(),
  updatedAt: z.string().min(1).optional(),
  mode: z.enum(['create', 'replace', 'update']).optional(),
  isAdminRequest: z.coerce.boolean<boolean>().optional(),
})

export const FeatureFormData = z.object({
  meta: FeatureFormMeta.optional(),
  data: FeatureEntityFormData,
})

export const FeaturePreflightFormData = FeatureFormData

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishFeatureSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveFeatureSchema = z.object({
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

export const FeatureProfile = z.enum(['list', 'card', 'detail', 'admin'])

export const FeaturePropertyCollectionAPI = FeaturePropertyBase.extend({
  i18n: getLocales(FeaturePropertyI18nBase).nullish(),
  property: PropertyDetailProfileAPI.optional(),
  propertyValue: PropertyValueDetailProfileAPI.nullish(),
})

export const FeaturePropertyAPI = FeaturePropertyBase.extend({
  i18n: getLocales(FeaturePropertyI18nBase).nullish(),
  property: PropertyAdminProfileAPI.optional(),
  propertyValue: PropertyValueAdminProfileAPI.nullish(),
})

const FeatureListFields = FeatureBase.pick({
  id: true,
  organisationId: true,
  projectId: true,
  layerId: true,
  contributorId: true,
  geometry: true,
  addressMeta: true,
  isPublished: true,
  isPendingReview: true,
  isArchived: true,
  isIntangible: true,
  isVisitable: true,
  createdAt: true,
  modifiedAt: true,
})

export const FeatureListProfileAPI = FeatureListFields.extend({
  i18n: getLocales(FeatureI18nBase),
  properties: z.array(FeaturePropertyCollectionAPI).default([]),
  image: ImageContextEnvelopeAPI.nullish(),
  imageCount: z.number().int().default(0),
  imagePublishedCount: z.number().int().default(0),
})

export const FeatureCardProfileAPI = FeatureListProfileAPI.extend({
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
})

export const FeatureDetailProfileAPI = FeatureCardProfileAPI.extend({
  images: z.array(ImageContextEnvelopeAPI).nullish(),
})

export const FeatureAdminProfileAPI = FeatureBase.extend({
  i18n: getLocales(FeatureI18nBase),
  properties: z.array(FeaturePropertyAPI).default([]),
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  images: z.array(ImageContextEnvelopeAPI).nullish(),
})
