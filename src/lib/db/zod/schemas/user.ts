// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { user, userFeature, userLayer } from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints } from '../constraints';
import { FeatureBase } from './feature';

/* ----------------- */
// USER SCHEMAS
/* -------- */

export const UserBase = createSelectSchema(user);
export const UserPrivacyPreserving = UserBase.omit({
  email: true,
  emailVerified: true,
  createdAt: true,
  modifiedAt: true
} as const);
export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true
} as const);
export const UserUpdate = createUpdateSchema(user);

/* ----------------- */
// USER RELATIONAL SCHEMAS
/* -------- */

export const UserLayerBase = createSelectSchema(userLayer);
export const UserLayerInsert = createInsertSchema(userLayer);
export const UserLayerUpdate = createUpdateSchema(userLayer);


export const UserFeatureBase = createSelectSchema(userFeature);
// TODO - Check if this is necessary to extend -- isn't it already provided by model?
export const UserFeatureInsert = createInsertSchema(userFeature).extend({
  isVisited: z.boolean().default(false),
  isWishlisted: z.boolean().default(false)
});
export const UserFeatureUpdate = createUpdateSchema(userFeature)
export const UserFeatureUpdateExtended = UserFeatureUpdate.extend({
  hierarchy: z.object({
    organisation: z.string(),
    project: z.string(),
    layer: z.string().nullable(),
    feature: z.string()
  })
});

/* ----------------- */
// USER API SCHEMAS
/* -------- */

export const UserAPI = UserBase.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase)
});

// There is no UserInsertAPI because users are created by AuthJS

export const UserUpdateAPI = UserUpdate.extend({
  userLayers: z.array(UserLayerUpdate)
});

export const UserLayerUpdateAPI = UserLayerUpdate.extend({
  user: UserBase.optional(),
  layer: UserLayerBase.optional()
});

export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
  user: UserBase.optional(),
  feature: FeatureBase.optional()
});


// TODO Remove once we've migrated to the new schemas
/* ----------------- */
// DEPRECATED USER SCHEMAS
/* -------- */

// export const UserLayerBase = createSelectSchema(userLayer);
// export const UserLayerInsert = createInsertSchema(userLayer);
// export const UserLayerUpdate = UserLayerInsert.extend({
//   userId: z.string(),
//   layerId: z.string()
// });

// export const UserLayerUpdateAPI = UserLayerUpdate.extend({
//   user: UserBase.optional(),
//   layer: LayerBase.optional()
// });

// // USER EXTENDED

// export const UserUpdateAPI = UserBase.extend({
//   userLayers: z.array(UserLayerUpdate)
// });

// export const UserUpdate = UserPrivacyPreserving.extend({
//   userLayers: z.array(UserLayerUpdate)
// });

// export const UserPatch = UserUpdate.partial();

// // Base schemas
// export const UserFeatureBase = createSelectSchema(userFeature);
// export const UserFeatureInsert = createInsertSchema(userFeature).extend({
//   isVisited: z.boolean().default(false),
//   isWishlisted: z.boolean().default(false)
// });

// export const UserFeatureUpdate = UserFeatureInsert.extend({
//   userId: z.string(),
//   featureId: z.string()
// });

// export const UserFeatureUpdateExtended = UserFeatureUpdate.extend({
//   hierarchy: z.object({
//     organisation: z.string(),
//     project: z.string(),
//     layer: z.string().nullable(),
//     feature: z.string()
//   })
// });

// export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
//   user: UserBase.optional(),
//   feature: FeatureBase.optional()
// });
