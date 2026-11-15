import { automaticTranslationReadFields } from '#lib/i18n/automaticSchema.js'
import { FeatureNameTemplateSchema } from '#lib/features/locationPolicy.js'
// SHARED TRANSLATIONS
import { FeatureI18nBase } from './featureI18n'
// PLACE CONTRACTS
import { LocationLifecycleSummarySchema } from '#lib/locations/lifecycle.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// I18N
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
} from '#lib/db/schema/index.js'
// CONSTRAINTS
import { ContentTagInput, contentLocaleMap } from '#lib/i18n/contentRecords.js'
import { FormBoolean } from '../form'
import { AddressMetaSchema } from '#lib/addresses/featureAddress.js'
// ZOD SCHEMAS
import {
  PropertyAdminProfileAPI,
  PropertyDetailProfileAPI,
  PropertyValueAdminProfileAPI,
  PropertyValueDetailProfileAPI,
} from './property'
import { ImageContextEnvelopeAPI } from './image'
import { UserBasic } from './user'
// TYPES
import type { AddressProperties } from '#lib/utils/address.types.js'
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

export const FeatureBase = createSelectSchema(feature)
  .omit({ spatialIndex: true, formWriteToken: true })
  .extend({
    nameTemplate: FeatureNameTemplateSchema.nullish(),
    mtrStation: z.string().nullish(),
    mtrExit: z.string().nullish(),
    mtrDistance: z.number().int().nonnegative().nullish(),
    mtrResolution: z.custom<import('#lib/routing/mtr.js').MtrResolution>().nullish(),
    countryId: z.string().nullish(),
    areaId: z.string().nullish(),
    districtId: z.string().nullish(),
    townId: z.string().nullish(),
    ruralAreaId: z.string().nullish(),
    macrohoodId: z.string().nullish(),
    neighbourhoodId: z.string().nullish(),
    villageId: z.string().nullish(),
    microhoodId: z.string().nullish(),
    hamletId: z.string().nullish(),
    islandId: z.string().nullish(),
    divisionResolution: z
      .object({
        status: z.string(),
        branches: z.record(z.string(), z.array(z.array(z.string()))),
      })
      .nullish(),

    geometry: z.custom<GeometryObject>(),
    addressMeta: AddressMetaSchema.default({}),
  })

export const FeatureInsert = createInsertSchema(feature)
  .omit({
    spatialIndex: true,
    formWriteToken: true,
    mtrStation: true,
    mtrExit: true,
    mtrDistance: true,
    mtrResolution: true,
    countryId: true,
    areaId: true,
    districtId: true,
    townId: true,
    ruralAreaId: true,
    macrohoodId: true,
    neighbourhoodId: true,
    villageId: true,
    microhoodId: true,
    hamletId: true,
    islandId: true,
    divisionResolution: true,
  })
  .extend({
    geometry: z.custom<GeometryObject>().prefault({
      type: 'Point',
      coordinates: [114.1693671540923, 22.319307515052614],
    }),
    addressMeta: AddressMetaSchema.prefault({}),
    isPublished: FormBoolean.default(false),
    isPendingReview: FormBoolean.default(false),
    isArchived: FormBoolean.default(false),
    isDraft: FormBoolean.default(false),
    isIntangible: FormBoolean.default(false),
    isVisitable: FormBoolean.default(true),
  })

export const FeatureUpdate = createUpdateSchema(feature)
  .omit({
    spatialIndex: true,
    formWriteToken: true,
    mtrStation: true,
    mtrExit: true,
    mtrDistance: true,
    mtrResolution: true,
    countryId: true,
    areaId: true,
    districtId: true,
    townId: true,
    ruralAreaId: true,
    macrohoodId: true,
    neighbourhoodId: true,
    villageId: true,
    microhoodId: true,
    hamletId: true,
    islandId: true,
    divisionResolution: true,
  })
  .extend({
    geometry: z.custom<GeometryObject>().optional(),
    addressMeta: AddressMetaSchema.optional(),
    isPublished: FormBoolean.optional(),
    isPendingReview: FormBoolean.optional(),
    isArchived: FormBoolean.optional(),
    isDraft: FormBoolean.optional(),
    isIntangible: FormBoolean.optional(),
    isVisitable: FormBoolean.optional(),
  })

export { FeatureI18nBase } from './featureI18n'

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
  valueJson: z.string().max(65536).nullish(),
  propertyValueId: z.string().nullish(),
})

export const FeaturePropertyInsert = createInsertSchema(featureProperty)
  .omit({
    featureId: true,
  })
  .extend({
    value: z.string().nullish(),
    valueJson: z.string().max(65536).nullish(),
    propertyValueId: z.string().nullish(),
  })

export const FeaturePropertyUpdate = createUpdateSchema(featureProperty)
  .omit({
    featureId: true,
  })
  .extend({
    value: z.string().nullish(),
    valueJson: z.string().max(65536).nullish(),
    propertyValueId: z.string().nullish(),
  })

export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n).extend({
  ...automaticTranslationReadFields,
  locale: ContentTagInput,
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

// SQLite relational extras return JSON text; decode only in the read-only response contract.
const ReadLocationLifecycle = z.preprocess(
  value => (typeof value === 'string' ? JSON.parse(value) : value),
  LocationLifecycleSummarySchema.nullish(),
)
const ReadFeatureAuthoring = z.preprocess(
  value => (typeof value === 'string' ? JSON.parse(value) : value),
  z
    .object({
      nameMode: z.enum(['inherit', 'independent']),
      hasLocation: z.union([z.boolean(), z.number()]).optional(),
    })
    .optional(),
)
const ReadLocationNames = z.preprocess(
  value => (typeof value === 'string' ? JSON.parse(value) : value),
  LocationFactsSchema.shape.names.nullish(),
)
const ReadLocationBrands = z.preprocess(
  value => (typeof value === 'string' ? JSON.parse(value) : value),
  LocationFactsSchema.shape.brands.nullish(),
)

export const FeatureListRow = FeatureBase.extend({
  locationBrands: ReadLocationBrands,
  locationNames: ReadLocationNames,
  authoring: ReadFeatureAuthoring,
  locationLifecycle: ReadLocationLifecycle,
  indoorUnitId: z.string().nullish(),
  divisionMemberships: z
    .array(z.object({ divisionId: z.string(), selected: z.boolean() }))
    .optional(),
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
  locationBrands: ReadLocationBrands,
  locationNames: ReadLocationNames,
  authoring: ReadFeatureAuthoring,
  locationLifecycle: ReadLocationLifecycle,
  indoorUnitId: z.string().nullish(),
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

export {
  FeatureI18nFormData,
  FeatureDraftI18nFormData,
  FeaturePropertyI18nFormData,
  FeaturePropertyI18nByLocaleFormData,
  FeaturePropertyFormData,
  FeatureI18nByLocaleFormData,
  FeatureDraftI18nByLocaleFormData,
  FeatureEntityFormData,
  FeatureDraftEntityFormData,
  FeatureFormMeta,
  FeatureFormData,
  FeaturePreflightFormData,
} from './feature.form'

// ═══════════════════════
// 3. REMOTE COMMAND SCHEMAS
// ═══════════════════════

export const PublishFeatureSchema = z.object({
  id: z.string().min(1),
  state: z.coerce.boolean<boolean>(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const PublishFeatureImagesSchema = z.object({
  id: z.string().min(1),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

export const RemoveFeatureSchema = z.object({
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
export const FeatureProfile = z.enum([
  'compact',
  'default',
  'map',
  'full',
  'admin',
  'list',
  'card',
  'detail',
])

export const FeaturePropertyCollectionAPI = FeaturePropertyBase.extend({
  i18n: contentLocaleMap(
    FeaturePropertyI18nBase.partial({ featureId: true, propertyId: true }),
  ).nullish(),
  property: PropertyDetailProfileAPI.optional(),
  propertyValue: PropertyValueDetailProfileAPI.nullish(),
})

export const FeaturePropertyAPI = FeaturePropertyBase.extend({
  i18n: contentLocaleMap(
    FeaturePropertyI18nBase.partial({ featureId: true, propertyId: true }),
  ).nullish(),
  property: PropertyAdminProfileAPI.optional(),
  propertyValue: PropertyValueAdminProfileAPI.nullish(),
})

const FeatureListFields = FeatureBase.pick({
  featureType: true,
  kind: true,
  targetContext: true,
  associationRelation: true,
  mtrStation: true,
  mtrExit: true,
  mtrDistance: true,
  mtrResolution: true,
  countryId: true,
  areaId: true,
  districtId: true,
  townId: true,
  ruralAreaId: true,
  macrohoodId: true,
  neighbourhoodId: true,
  villageId: true,
  microhoodId: true,
  hamletId: true,
  islandId: true,
  divisionResolution: true,

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
  locationBrands: ReadLocationBrands,
  locationNames: ReadLocationNames,
  authoring: ReadFeatureAuthoring,
  locationLifecycle: ReadLocationLifecycle,
  indoorUnitId: z.string().nullish(),
  divisionMemberships: z
    .array(z.object({ divisionId: z.string(), selected: z.boolean() }))
    .optional(),
  i18n: contentLocaleMap(FeatureI18nBase.partial({ featureId: true })).nullish(),
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
  // First-frame policy is a read projection, never accepted as editable parent authority.
  presentationPolicy: z.preprocess(
    value => (typeof value === 'string' ? JSON.parse(value) : value),
    z
      .object({
        allowDescriptions: z.coerce.boolean(),
        locationBasedNames: z.coerce.boolean(),
      })
      .nullish(),
  ),
  locationBrands: ReadLocationBrands,
  locationNames: ReadLocationNames,
  authoring: ReadFeatureAuthoring,
  locationLifecycle: ReadLocationLifecycle,
  indoorUnitId: z.string().nullish(),
  i18n: contentLocaleMap(FeatureI18nBase.partial({ featureId: true })).nullish(),
  properties: z.array(FeaturePropertyAPI).default([]),
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  image: ImageContextEnvelopeAPI.nullish(),
  images: z.array(ImageContextEnvelopeAPI).nullish(),
})

/** Minimal identity and action state for paged resource lists. */
export const FeatureCompactProfileAPI = FeatureBase.pick({
  id: true,
  isPublished: true,
  isArchived: true,
  modifiedAt: true,
  organisationId: true,
  projectId: true,
  layerId: true,
}).extend({
  i18n: contentLocaleMap(FeatureI18nBase.pick({ title: true })).nullish(),
})
