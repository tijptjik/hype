// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  feature,
  featureI18n,
  featureImage,
  featureProperty,
  featurePropertyI18n,
  image,
  userFeature,
} from '$lib/db/schema/index'
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints'
// ZOD SCHEMAS
import {
  PropertyAdminProfileAPI,
  PropertyDetailProfileAPI,
  PropertyI18nRecord,
  PropertyRecord,
  PropertyValueAdminProfileAPI,
  PropertyValueDetailProfileAPI,
  PropertyValueI18nRecord,
  PropertyValueRecord,
} from './property'
import { UserBasic } from './user'
// ENUMS
import { supportedLocales } from '$lib/enums'
// TYPES
import type { AddressMeta, AddressProperties } from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
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
//
// 2. REMOTE PROFILE / API SCHEMAS
//    - FeaturePropertyCollectionAPI
//    - FeaturePropertyAPI
//    - FeaturePropertyInsertAPI
//    - FeaturePropertyUpdateAPI
//    - FeaturePropertyToMerge
//    - FeatureCollectionAPI
//    - FeatureAPI
//    - FeatureInsertAPI
//    - FeatureUpdateAPI
//    - UserFeatureAPI
//    - UserFeatureInsertAPI
//    - FeatureClientExt
//
// 3. INTERMEDIATE RAW SCHEMAS
//    - FeatureRaw

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const FeatureBase = createSelectSchema(feature)
export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  // HACK - Zod is not picking up the default values from the model
  isVisitable: z.boolean().prefault(true),
  geometry: z.custom<GeometryObject>().prefault({
    type: 'Point',
    coordinates: [114.1693671540923, 22.319307515052614],
  }),
  addressMeta: z.custom<AddressMeta>().prefault({}),
})
export const FeatureUpdate = createUpdateSchema(feature).extend({
  ...getDefaultConstraints(feature),
})

export const FeatureI18nBase = createSelectSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
  locale: z.enum(Object.values(supportedLocales) as [string, ...string[]]).nullish(),
})

export const FeatureI18nInsert = createInsertSchema(featureI18n)
  .omit({
    featureId: true,
  })
  .extend({
    ...getDefaultConstraints(featureI18n),
    addressProperties: z.custom<AddressProperties>().prefault({}).nullish(),
  })

export const FeatureI18nUpdate = createUpdateSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().nullish(),
})

// TYPE HELPER: Extract the available i18n field keys
export type FeatureI18nFieldKeys = keyof z.infer<typeof FeatureI18nInsert>

export const FeaturePropertyBase = createSelectSchema(featureProperty).extend({
  // value can be string, number, boolean, or null. Zod schema should reflect this.
  // For simplicity, keeping as string().nullable() but this might need to be z.any() or a union for more flexibility if type is not always string.
  // For simplicity, keeping as string().nullable() but this might need to be z.any() or a union for more flexibility if type is not always string.
  value: z.string().nullish(),
  propertyValueId: z.string().nullish(),
})

export const FeaturePropertyInsert = createInsertSchema(featureProperty).extend({
  value: z.string().nullable().optional(),
  propertyValueId: z.string().nullable().optional(),
})

export const FeaturePropertyUpdate = createUpdateSchema(featureProperty).extend({
  value: z.string().nullish(),
  propertyValueId: z.string().nullish(),
  featureId: z.string().optional(),
})

export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n)
export const FeaturePropertyI18nInsert = createInsertSchema(featurePropertyI18n).omit({
  featureId: true,
  propertyId: true,
})
export const FeaturePropertyI18nUpdate = createUpdateSchema(featurePropertyI18n)

// ═══════════════════════
// 2. REMOTE PROFILE / API SCHEMAS
// ═══════════════════════

export const FeaturePropertyCollectionAPI = FeaturePropertyBase.extend({
  property: PropertyDetailProfileAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nBase).nullish(),
  propertyValue: PropertyValueDetailProfileAPI.nullish(),
})

export const FeaturePropertyAPI = FeaturePropertyBase.extend({
  // Assuming a nested 'property' (the definition) and its i18n
  property: PropertyDetailProfileAPI.optional(), // The actual Property definition (e.g., name, type)
  // If FeatureProperty itself has direct translations (e.g. for its 'value' if it's translatable text)
  i18n: getLocales(FeaturePropertyI18nBase).nullish(), // Optional if not all feature properties have i18n
  // If the value points to a PropertyValue entity - used for categorical properties
  propertyValue: PropertyValueDetailProfileAPI.nullish(),
})

export const FeaturePropertyInsertAPI = FeaturePropertyInsert.extend({
  property: PropertyAdminProfileAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nInsert).nullish(),
  propertyValue: PropertyValueAdminProfileAPI.nullish(),
})

export const FeaturePropertyUpdateAPI = FeaturePropertyUpdate.extend({
  property: PropertyAdminProfileAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nUpdate).nullish(),
  propertyValue: PropertyValueAdminProfileAPI.optional(),
})

export const FeaturePropertyToMerge = FeaturePropertyCollectionAPI.extend({
  id: z.string().optional(),
  i18n: getLocales(FeaturePropertyI18nBase).nullish(),
})

export const UserFeatureBase = createSelectSchema(userFeature)
export const UserFeatureInsert = createInsertSchema(userFeature).extend({
  // TODO - Check if tis is necessary to extend -- isn't it already provided by model?
  // isVisited: z.boolean().default(false),
  // isWishlisted: z.boolean().default(false)
})
export const UserFeatureUpdate = createUpdateSchema(userFeature)
export const UserFeatureUpdateExtended = UserFeatureUpdate.extend({})

// Basic feature collection schema - optimized for performance
export const FeatureCollectionAPI = FeatureBase.omit({
  addressMeta: true,
  publisherId: true,
  publishedAt: true,
  visitableAsOf: true,
  modifiedAt: true,
}).extend({
  i18n: getLocales(
    FeatureI18nBase.extend({
      addressProperties: z
        .object({
          neighbourhood: z.string().nullish(),
        })
        .nullish(),
    }),
  ),
  properties: z.array(
    FeaturePropertyBase.extend({
      i18n: getLocales(FeaturePropertyI18nBase).nullish(),
    }),
  ),
  image: z.custom<ImageCtxEnvelope>().nullish(),
  imageCount: z.number(),
  imagePublishedCount: z.number(),
})

// Full feature entity schema
export const FeatureAPI = FeatureBase.extend({
  i18n: getLocales(FeatureI18nBase),
  properties: z.array(FeaturePropertyAPI),
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  image: z.custom<ImageCtxEnvelope>().nullish(),
  images: z.lazy(() => z.array(z.custom<ImageCtxEnvelope>()).nullish()),
})

export const FeatureInsertAPI = FeatureInsert.extend({
  i18n: getLocales(FeatureI18nInsert),
  properties: z.array(FeaturePropertyInsertAPI),
  isVisitable: z.boolean().prefault(true),
  addressMeta: z.custom<AddressMeta>().prefault({}).nullish(),
})

export const FeatureUpdateAPI = FeatureUpdate.extend({
  i18n: getLocales(FeatureI18nUpdate),
  properties: z.array(FeaturePropertyUpdateAPI),
})

/* ----------------- */
// FEATURE RELATIONAL API :: USER FEATURE
/* -------- */

export const UserFeatureAPI = UserFeatureBase
export const UserFeatureInsertAPI = UserFeatureInsert
// UserFeatureUpdateAPI defined in index.ts

// Extended on the client side to include hierarchy information
export const FeatureClientExt = FeatureCollectionAPI.extend({
  hierarchy: z.object({
    organisation: z.string().nullable(),
    project: z.string().nullable(),
    layer: z.string().nullable(),
    feature: z.string().nullable(),
  }),
})

// ═══════════════════════
// 3. INTERMEDIATE RAW SCHEMAS
// ═══════════════════════

export const FeatureRaw = FeatureBase.extend({
  images: z
    .lazy(() =>
      z.array(
        createSelectSchema(featureImage)
          .extend({
            image: createSelectSchema(image)
              .extend({
                contributor: UserBasic.nullish(),
              })
              .nullish(),
          })
          .nullish(),
      ),
    )
    .nullish(),
  i18n: z.array(FeatureI18nBase).optional(),
  properties: z
    .array(
      FeaturePropertyBase.extend({
        property: PropertyRecord.extend({
          i18n: z.array(PropertyI18nRecord).optional(),
          values: z
            .array(
              PropertyValueRecord.extend({
                i18n: z.array(PropertyValueI18nRecord).optional(),
              }),
            )
            .optional(),
        }).optional(),
      }),
    )
    .optional(),
})
