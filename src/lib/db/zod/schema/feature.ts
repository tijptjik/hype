// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
// DRIZZLE SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  image,
  userFeature
} from '$lib/db/schema/index';
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints';
// ZOD SCHEMAS
import {
  PropertyAPI,
  PropertyBase,
  PropertyI18nBase,
  PropertyInsertAPI,
  PropertyUpdateAPI,
  PropertyValueI18nBase,
  PropertyValueBase,
  PropertyValueAPI,
  PropertyValueInsertAPI,
  PropertyValueUpdateAPI
} from './property';
import { UserBasic } from './user';
import { FeatureImageAPI } from './image';
// TYPES
import type { AddressMeta, AddressProperties, Locale } from '$lib/types';
import type { GeometryObject } from 'geojson';
import { supportedLocales } from '$lib/enums';

/* ----------------- */
// FEATURE CORE
/* -------- */

export const FeatureBase = createSelectSchema(feature);
export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  // HACK - Zod is not picking up the default values from the model
  isVisitable: z.boolean().default(true),
  geometry: z.custom<GeometryObject>().default({
    type: 'Point',
    coordinates: [114.1693671540923, 22.319307515052614]
  }),
  addressMeta: z.custom<AddressMeta>().default({})
});
export const FeatureUpdate = createUpdateSchema(feature).extend({
  ...getDefaultConstraints(feature)
});

/* ----------------- */
// FEATURE RELATIONAL :: I18N
/* -------- */

export const FeatureI18nBase = createSelectSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().default({}).nullish(),
  locale: z.enum(Object.values(supportedLocales) as [string, ...string[]]).nullish()
});

export const FeatureI18nInsert = createInsertSchema(featureI18n)
  .omit({
    featureId: true
  })
  .extend({
    ...getDefaultConstraints(featureI18n),
    addressProperties: z.custom<AddressProperties>().default({}).nullish()
  });

export const FeatureI18nUpdate = createUpdateSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().nullish()
});

// TYPE HELPER: Extract the available i18n field keys
export type FeatureI18nFieldKeys = keyof z.infer<typeof FeatureI18nInsert>;

/* ----------------- */
// FEATURE RELATIONAL SCHEMAS :: PROPERTY CORE SCHEMAS
/* -------- */

export const FeaturePropertyBase = createSelectSchema(featureProperty).extend({
  // value can be string, number, boolean, or null. Zod schema should reflect this.
  // For simplicity, keeping as string().nullable() but this might need to be z.any() or a union for more flexibility if type is not always string.
  // For simplicity, keeping as string().nullable() but this might need to be z.any() or a union for more flexibility if type is not always string.
  value: z.string().nullish(),
  propertyValueId: z.string().nullish()
});

export const FeaturePropertyInsert = createInsertSchema(featureProperty).extend({
  value: z.string().nullable().optional(),
  propertyValueId: z.string().nullable().optional()
});

export const FeaturePropertyUpdate = createUpdateSchema(featureProperty).extend({
  value: z.string().nullish(),
  propertyValueId: z.string().nullish(),
  featureId: z.string().optional()
});

/* ----------------- */
// FEATURE RELATIONAL SCHEMAS :: PROPERTY I18N
/* -------- */

export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n);
export const FeaturePropertyI18nInsert = createInsertSchema(featurePropertyI18n).omit({
  featureId: true,
  propertyId: true
});
export const FeaturePropertyI18nUpdate = createUpdateSchema(featurePropertyI18n);

/* ----------------- */
// FEATURE API SCHEMAS :: PROPERTY
/* -------- */

export const FeaturePropertyCollectionAPI = FeaturePropertyBase.extend({
  property: PropertyAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nBase).nullish(),
  propertyValue: PropertyValueAPI.nullish()
});

export const FeaturePropertyAPI = FeaturePropertyBase.extend({
  // Assuming a nested 'property' (the definition) and its i18n
  property: PropertyAPI.optional(), // The actual Property definition (e.g., name, type)
  // If FeatureProperty itself has direct translations (e.g. for its 'value' if it's translatable text)
  i18n: getLocales(FeaturePropertyI18nBase).nullish(), // Optional if not all feature properties have i18n
  // If the value points to a PropertyValue entity - used for categorical properties
  propertyValue: PropertyValueAPI.nullish()
});

export const FeaturePropertyInsertAPI = FeaturePropertyInsert.extend({
  property: PropertyInsertAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nInsert).nullish(),
  propertyValue: PropertyValueInsertAPI.nullish()
});

export const FeaturePropertyUpdateAPI = FeaturePropertyUpdate.extend({
  property: PropertyUpdateAPI.optional(),
  i18n: getLocales(FeaturePropertyI18nUpdate).nullish(),
  propertyValue: PropertyValueUpdateAPI.optional()
});

export const FeaturePropertyToMerge = FeaturePropertyCollectionAPI.extend({
  id: z.string().optional(),
  i18n: getLocales(FeaturePropertyI18nBase).nullish()
});

/* ----------------- */
// FEATURE RELATIONAL SCHEMAS :: USER
/* -------- */

export const UserFeatureBase = createSelectSchema(userFeature);
export const UserFeatureInsert = createInsertSchema(userFeature).extend({
  // TODO - Check if tis is necessary to extend -- isn't it already provided by model?
  // isVisited: z.boolean().default(false),
  // isWishlisted: z.boolean().default(false)
});
export const UserFeatureUpdate = createUpdateSchema(userFeature);
export const UserFeatureUpdateExtended = UserFeatureUpdate.extend({});

/* ----------------- */
// FEATURE API
/* -------- */

// Basic feature collection schema - optimized for performance
export const FeatureCollectionAPI = FeatureBase.omit({
  addressMeta: true,
  publisherId: true,
  publishedAt: true,
  visitableAsOf: true,
  createdAt: true,
  modifiedAt: true
}).extend({
  i18n: getLocales(
    FeatureI18nBase.extend({
      addressProperties: z
        .object({
          neighbourhood: z.string().nullish()
        })
        .nullish()
    })
  ),
  properties: z.array(
    FeaturePropertyBase.extend({
      i18n: getLocales(FeaturePropertyI18nBase).nullish()
    })
  ),
  image: createSelectSchema(image)
    .pick({
      id: true,
      cdn: true,
      env: true,
      cdnId: true,
      publicId: true,
      version: true
    })
    .nullish(),
  imageCount: z.number(),
  imagePublishedCount: z.number()
});

// Full feature entity schema
export const FeatureAPI = FeatureBase.extend({
  i18n: getLocales(FeatureI18nBase),
  properties: z.array(FeaturePropertyAPI),
  contributor: UserBasic.nullish(),
  publisher: UserBasic.nullish(),
  image: createSelectSchema(image)
    .pick({
      id: true,
      cdn: true,
      env: true,
      cdnId: true,
      publicId: true,
      version: true
    })
    .nullish(),
  images: z.lazy(() => z.array(FeatureImageAPI).nullish())
});

export const FeatureInsertAPI = FeatureInsert.extend({
  i18n: getLocales(FeatureI18nInsert),
  properties: z.array(FeaturePropertyInsertAPI),
  isVisitable: z.boolean().default(true),
  addressMeta: z.custom<AddressMeta>().default({}).nullish()
});

export const FeatureUpdateAPI = FeatureUpdate.extend({
  i18n: getLocales(FeatureI18nUpdate),
  properties: z.array(FeaturePropertyUpdateAPI),
  image: createSelectSchema(image)
    .pick({
      id: true,
      cdn: true,
      env: true,
      cdnId: true,
      publicId: true,
      version: true
    })
    .nullish()
});

/* ----------------- */
// FEATURE RELATIONAL API :: USER FEATURE
/* -------- */

export const UserFeatureAPI = UserFeatureBase;
export const UserFeatureInsertAPI = UserFeatureInsert;
// UserFeatureUpdateAPI defined in index.ts

// Extended on the client side to include hierarchy information
export const FeatureClientExt = FeatureCollectionAPI.extend({
  hierarchy: z.object({
    organisation: z.string().nullable(),
    project: z.string().nullable(),
    layer: z.string().nullable(),
    feature: z.string().nullable()
  })
});

/* ----------------- */
// FEATURE INTERMEDIATE SCHEMAS
/* -------- */

export const FeatureRaw = FeatureBase.extend({
  image: createSelectSchema(image).nullish(),
  i18n: z.array(FeatureI18nBase).optional(),
  properties: z
    .array(
      FeaturePropertyBase.extend({
        property: PropertyBase.extend({
          i18n: z.array(PropertyI18nBase).optional(),
          values: z
            .array(
              PropertyValueBase.extend({
                i18n: z.array(PropertyValueI18nBase).optional()
              })
            )
            .optional()
        }).optional()
      })
    )
    .optional()
});
