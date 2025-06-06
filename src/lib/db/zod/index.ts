/* ----------------- */
// CONSTRAINTS & UTILITIES
/* -------- */
export * from './constraints';

/* ----------------- */
// USER SCHEMAS
/* -------- */
export * from './schemas/user';

/* ----------------- */
// ORGANISATION SCHEMAS
/* -------- */
export * from './schemas/organisation';

/* ----------------- */
// PROJECT SCHEMAS
/* -------- */
export * from './schemas/project';

/* ----------------- */
// LAYER SCHEMAS
/* -------- */
export * from './schemas/layer';

/* ----------------- */
// FEATURE SCHEMAS
/* -------- */
export * from './schemas/feature';

/* ----------------- */
// PROPERTY SCHEMAS
/* -------- */
export * from './schemas/property'; 

/* ----------------- */
// TASK SCHEMAS
/* -------- */
export * from './schemas/task';

/* ----------------- */
// IMAGE SCHEMAS
/* -------- */
export * from './schemas/image';

/* ----------------- */
// HUB SCHEMAS
/* -------- */
export * from './schemas/hub';

/* ----------------- */
// USER API SCHEMAS - AVOID CIRCULAR DEPENDENCIES
/* -------- */

// ZOD
import { z } from 'zod';
import { UserBase, UserUpdate, UserBasic, UserCurrent } from './schemas/user';
import { UserLayerBase, UserLayerUpdate, UserLayerInsert } from './schemas/layer';
import { FeatureBase, UserFeatureBase, UserFeatureInsert, UserFeatureUpdate } from './schemas/feature';

export const UserAPI = UserBasic.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase)
});

export const UserCollectionAPI = UserBasic.extend({
  email: z.string().email().nullish()
});

export const UserCurrentAPI = UserCurrent.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase)
});

export const UserLayerAPI = UserLayerBase.extend({
  user: UserBase.optional(),
  layer: UserLayerBase.optional()
});

// There is no UserInsertAPI because users are created by AuthJS

export const UserUpdateAPI = UserUpdate.extend({
  userLayers: z.array(UserLayerInsert).optional(), // Fully specified, but optional.
  userFeatures: z.array(UserFeatureInsert).optional()
});

export const UserLayerUpdateAPI = UserLayerUpdate.extend({
  // These are required for the upsert operation
  userId: z.string(),
  layerId: z.string(),
  // These are optional for the response shape
  user: UserBase.optional(),
  layer: UserLayerBase.optional()
});

export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
  // These are required for the upsert operation
  userId: z.string(),
  featureId: z.string(),
  // These are optional for the response shape
  // user: UserBase.optional(),
  // feature: z.lazy(() => FeatureBase).optional()
});

export const UserBaseRaw = UserBase.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase)
});