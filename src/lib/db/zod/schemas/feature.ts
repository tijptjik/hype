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
  featurePropertyI18n
} from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints';
// TYPES
import type { AddressMeta, AddressProperties } from '$lib/types';
import type { GeometryObject } from 'geojson';

/* ----------------- */
// FEATURE CORE SCHEMAS
/* -------- */

export const FeatureBase = createSelectSchema(feature);
export const FeatureInsert = createInsertSchema(feature).extend({
  ...getDefaultConstraints(feature),
  isIntangible: z.boolean().default(false),
  isVisitable: z.boolean().default(true),
  contributorId: z.string().optional(),
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
// FEATURE RELATIONAL SCHEMAS :: PROPERTIES
/* -------- */

export const FeaturePropertyBase = createSelectSchema(featureProperty);
export const FeaturePropertyInsert = createInsertSchema(featureProperty).extend({
  value: z.string().nullable()
});
export const FeaturePropertyUpdate = createUpdateSchema(featureProperty).extend({
  value: z.string().nullable()
});

/* ----------------- */
// FEATURE RELATIONAL SCHEMAS :: I18N
/* -------- */

export const FeatureI18nBase = createSelectSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().default({})
});

export const FeatureI18nInsert = createInsertSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>().default({})
});

export const FeatureI18nUpdate = createUpdateSchema(featureI18n).extend({
  ...getDefaultConstraints(featureI18n),
  addressProperties: z.custom<AddressProperties>()
});

export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n);
export const FeaturePropertyI18nInsert = createInsertSchema(featurePropertyI18n);
export const FeaturePropertyI18nUpdate = createUpdateSchema(featurePropertyI18n);

/* ----------------- */
// FEATURE API SCHEMAS
/* -------- */

export const FeatureAPI = FeatureBase.extend({
  i18n: getLocales(FeatureI18nBase),
  properties: z.array(FeaturePropertyBase)
});

export const FeatureInsertAPI = FeatureInsert.extend({
  i18n: getLocales(FeatureI18nInsert),
  properties: z.array(FeaturePropertyInsert)
});

export const FeatureUpdateAPI = FeatureUpdate.extend({
  i18n: getLocales(FeatureI18nUpdate),
  properties: z.array(FeaturePropertyUpdate)
});

// TODO Remove once we've migrated to the new schemas
/* ----------------- */
// DEPRECATED FEATURE SCHEMAS
/* -------- */

// export const FeaturePropertyBase = createSelectSchema(featureProperty);
// export const FeaturePropertyI18nBase = createSelectSchema(featurePropertyI18n);

// // Base schema to validate submit data
// export const FeaturePropertyInsert = createInsertSchema(featureProperty)
//   .extend({
//     value: z.string().nullable()
//   })
//   .omit({
//     featureId: true
//   });
// export const FeaturePropertyInsertExtra = FeaturePropertyInsert.extend({
//   property: PropertyInsertAPI.omit({ values: true }).deepPartial(),
//   propertyValue: PropertyValueInsertAPI.optional()
// });

// export const FeaturePropertyUpdate = FeaturePropertyInsert.extend({
//   id: z.string()
// });
// export const FeaturePropertyUpdateExtra = FeaturePropertyUpdate.extend({
//   property: PropertyInsertAPI.omit({ values: true }).deepPartial(),
//   propertyValue: PropertyValueInsertAPI.optional()
// });

// export const FeaturePropertyI18nUpdate = createInsertSchema(featurePropertyI18n);
// export const FeaturePropertyI18nInsert = FeaturePropertyI18nUpdate.omit({
//   featurePropertyId: true
// });

// export const FeaturePropertyInsertAPI = FeaturePropertyInsertExtra.extend({
//   i18n: z.union([getLocales(FeaturePropertyI18nInsert), z.object({})])
// });
// export const FeaturePropertyUpdateAPI = FeaturePropertyUpdateExtra.extend({
//   i18n: z.union([getLocales(FeaturePropertyI18nUpdate), z.object({})])
// });

// /* ----------------- */
// // FEATURES
// /* -------- */

// const PointGeometry = z.object({
//   type: z.literal('Point'),
//   coordinates: z.array(z.number())
// });

// // Feature Schemas
// export const FeatureBase = createSelectSchema(feature);
// export const FeatureI18nBase = createSelectSchema(featureI18n);

// // Base schema to validate submit data
// export const FeatureInsert = createInsertSchema(feature).extend({
//   ...getDefaultConstraints(feature),
//   isIntangible: z.boolean().default(false),
//   isVisitable: z.boolean().default(true),
//   contributorId: z.string().optional(),
//   geometry: z.custom<GeometryObject>().default({
//     type: 'Point',
//     coordinates: [114.1693671540923, 22.319307515052614]
//   }),
//   // TODO These are NOT custom, they should just be z.object()
//   addressProperties: z.custom<AddressProperties>().default({}),
//   addressMeta: z.custom<AddressMeta>().default({})
// });

// export const FeatureUpdate = FeatureInsert.extend({
//   id: z.string()
// });

// export const FeatureI18nInsert = createInsertSchema(featureI18n)
//   .omit({ featureId: true })
//   .extend({
//     ...getDefaultConstraints(featureI18n)
//   });
// export const FeatureI18nUpdate = createSelectSchema(featureI18n).extend({
//   ...getDefaultConstraints(featureI18n)
// });

// // Update existing Feature schemas to include new relations
// export const FeatureInsertAPI = FeatureInsert.extend({
//   i18n: getLocales(FeatureI18nInsert),
//   properties: z.array(FeaturePropertyInsertAPI)
//   // images: z.array(FeatureImageInsert).optional(),
//   // users: z.array(UserFeatureInsert).optional(),
//   // tasks: z.array(TaskInsert).optional()
// });

// export const FeatureUpdateAPI = FeatureUpdate.extend({
//   i18n: getLocales(FeatureI18nUpdate),
//   properties: z.array(FeaturePropertyUpdateAPI)
//   // images: z.array(FeatureImageUpdate).optional(),
//   // users: z.array(UserFeatureUpdate).optional(),
//   // tasks: z.array(TaskUpdate).optional()
// });

// export const FeaturePatch = FeatureUpdate.partial();

// export const FeatureGetAPI = FeatureUpdateAPI.extend({
//   layer: LayerUpdateAPI.optional(),
//   project: ProjectUpdateAPI.optional(),
//   organisation: OrganisationUpdateAPI.optional()
// });
