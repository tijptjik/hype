// ZOD
import { z } from 'zod';
// DRIZZLE
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema
} from 'drizzle-zod';
import { layer, layerI18n, layerProperty, userLayer } from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints, getLocales } from '../constraints';
// ZOD SCHEMAS
import {
  PropertyBase,
  PropertyI18nBase,
  PropertyInsertAPI,
  PropertyValueBase,
  PropertyValueI18nBase
} from './property';
import { UserBasic } from './user';
// TYPES
import type { LayerMetadata } from '$lib/types';

/* ----------------- */
// LAYER CORESCHEMAS
/* -------- */

export const LayerBase = createSelectSchema(layer);
export const LayerInsert = createInsertSchema(layer).extend({
  ...getDefaultConstraints(layer),
  metadata: z.custom<LayerMetadata>().default({})
});
export const LayerUpdate = createUpdateSchema(layer).extend({
  ...getDefaultConstraints(layer)
});

/* ----------------- */
// LAYER RELATIONAL SCHEMAS
/* -------- */

export const LayerI18nBase = createSelectSchema(layerI18n);
export const LayerI18nInsert = createInsertSchema(layerI18n)
  .extend({
    ...getDefaultConstraints(layerI18n)
  })
  .omit({
    layerId: true
  });
export const LayerI18nUpdate = createUpdateSchema(layerI18n).extend({
  ...getDefaultConstraints(layerI18n)
});

export const LayerPropertyBase = createSelectSchema(layerProperty);
export const LayerPropertyInsert = createInsertSchema(layerProperty).omit({
  layerId: true
});
export const LayerPropertyInsertExtra = LayerPropertyInsert.extend({
  property: PropertyInsertAPI.optional()
});

export const LayerPropertyUpdate = createUpdateSchema(layerProperty);
// Make property optional so it validates whether nested data is present or not
export const LayerPropertyUpdateExtra = LayerPropertyUpdate.extend({
  property: PropertyInsertAPI.optional()
});

/* ----------------- */
// USER RELATIONAL SCHEMAS
/* -------- */

export const UserLayerBase = createSelectSchema(userLayer);
export const UserLayerInsert = createInsertSchema(userLayer).extend({
  isVisibleOnLoad: z.boolean()
});
export const UserLayerUpdate = createUpdateSchema(userLayer);

/* ----------------- */
// LAYER API SCHEMAS
/* -------- */

export const LayerAPI = LayerBase.extend({
  i18n: getLocales(LayerI18nBase),
  properties: z.array(LayerPropertyUpdateExtra),
  publisher: UserBasic.nullish()
});

export const LayerInsertAPI = LayerInsert.extend({
  i18n: getLocales(LayerI18nInsert),
  properties: z.array(LayerPropertyInsertExtra),
  publisher: UserBasic.nullish()
});

export const LayerUpdateAPI = LayerUpdate.extend({
  i18n: getLocales(LayerI18nUpdate),
  properties: z.array(LayerPropertyUpdateExtra),
  publisher: UserBasic.nullish()
});

/* ----------------- */
// LAYER RAW SCHEMAS
/* -------- */

export const LayerPropertyRaw = LayerPropertyBase.extend({
      property: PropertyBase.extend({
        i18n: z.array(PropertyI18nBase),
        values: z
          .array(
            PropertyValueBase.extend({
              i18n: z.array(PropertyValueI18nBase).optional()
            })
          ).nullish()
          .nullish()
      }).nullish()
    })

export const LayerRaw = LayerBase.extend({
  i18n: z.array(LayerI18nBase),
  properties: z.array(LayerPropertyRaw)
});
