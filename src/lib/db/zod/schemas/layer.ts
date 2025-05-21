// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
import { layer, layerI18n, layerProperty } from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints';
// TYPES
import type { LayerMetadata } from '$lib/types';
// ZOD SCHEMAS
import { PropertyInsertAPI } from './property';

/* ----------------- */
// LAYER CORESCHEMAS
/* -------- */

export const LayerBase = createSelectSchema(layer);
export const LayerInsert = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().default({ defaultEnabled: false }),
  // TODO - Why is this here? Check if this can be deleted.
  id: z.string().optional()
});
export const LayerUpdate = createUpdateSchema(layer).extend({
  ...getDefaultConstraints(layer)
});

/* ----------------- */
// LAYER RELATIONAL SCHEMAS
/* -------- */

export const LayerI18nBase = createSelectSchema(layerI18n);
export const LayerI18nInsert = createInsertSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n)
});
export const LayerI18nUpdate = createUpdateSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n)
});

export const LayerPropertyBase = createSelectSchema(layerProperty);
export const LayerPropertyInsert = createInsertSchema(layerProperty);
// TODO Confirm if this is correct
export const LayerPropertyInsertExtra = LayerPropertyInsert.extend({
  property: PropertyInsertAPI.omit({ values: true })
});

export const LayerPropertyUpdate = createUpdateSchema(layerProperty);
// TODO Confirm if this is correct
export const LayerPropertyUpdateExtra = LayerPropertyUpdate.extend({
  property: PropertyInsertAPI.omit({ values: true })
});

/* ----------------- */
// LAYER API SCHEMAS
/* -------- */

export const LayerAPI = LayerBase.extend({
  i18n: getLocales(LayerI18nBase),
  properties: z.array(LayerPropertyBase)
});

export const LayerInsertAPI = LayerInsert.extend({
  i18n: getLocales(LayerI18nInsert),
  properties: z.array(LayerPropertyInsert)
});

export const LayerUpdateAPI = LayerUpdate.extend({
  i18n: getLocales(LayerI18nUpdate),
  properties: z.array(LayerPropertyUpdateExtra)
});


// TODO Remove once we've migrated to the new schemas
/* ----------------- */
// DEPRECATED LAYERS
/* -------- */

// // Schema for selecting a layer - can be used to validate API responses
// export const LayerBase = createSelectSchema(layer).extend({
//   experimental: z
//     .object({
//       contributorMode: z.boolean()
//     })
//     .default({ contributorMode: false }),
//   language: z.enum(supportedLocales).default('en')
// });
// export const LayerI18nBase = createSelectSchema(layerI18n);

// // Base schema to validate submit data
// export const LayerInsert = createInsertSchema(layer).extend({
//   ...getDefaultConstraints(layer),
//   metadata: z.custom<LayerMetadata>().default({ defaultEnabled: true }),
//   experimental: z
//     .object({
//       contributorMode: z.boolean()
//     })
//     .default({ contributorMode: false }),
//   language: z.enum(supportedLocales).default('en')
// });

// export const LayerUpdate = LayerInsert.extend({
//   id: z.string()
// });

// export const LayerI18nUpdate = createInsertSchema(layerI18n).extend({
//   ...getDefaultConstraints(layerI18n)
// });

// export const LayerPropertyUpdate = createInsertSchema(layerProperty);
// export const LayerPropertyUpdateExtra = LayerPropertyUpdate.extend({
//   property: PropertyInsertAPI.omit({ values: true })
// });
// export const LayerPropertyInsert = LayerPropertyUpdateExtra.omit({ layerId: true });

// export const LayerI18nInsert = LayerI18nUpdate.omit({ layerId: true });

// export const LayerInsertAPI = LayerInsert.extend({
//   i18n: getLocales(LayerI18nInsert),
//   properties: z.array(LayerPropertyInsert)
// });

// export const LayerUpdateAPI = LayerUpdate.extend({
//   i18n: getLocales(LayerI18nUpdate),
//   properties: z.array(LayerPropertyUpdateExtra)
// });

// export const LayerUpdateAPIWithProject = LayerUpdateAPI.extend({
//   project: ProjectBase
// });

// export const LayerPatch = LayerUpdate.partial();
