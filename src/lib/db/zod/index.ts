/* ----------------- */
// CONSTRAINTS & UTILITIES
/* -------- */
export * from './constraints';

/* ----------------- */
// USER SCHEMAS
/* -------- */
export * from './schema/user';

/* ----------------- */
// ORGANISATION SCHEMAS
/* -------- */
export * from './schema/organisation';

/* ----------------- */
// PROJECT SCHEMAS
/* -------- */
export * from './schema/project';

/* ----------------- */
// LAYER SCHEMAS
/* -------- */
export * from './schema/layer';

/* ----------------- */
// FEATURE SCHEMAS
/* -------- */
export * from './schema/feature';

/* ----------------- */
// PROPERTY SCHEMAS
/* -------- */
export * from './schema/property';

/* ----------------- */
// TASK SCHEMAS
/* -------- */
export * from './schema/task';

/* ----------------- */
// IMAGE SCHEMAS
/* -------- */
export * from './schema/image';

/* ----------------- */
// HUB SCHEMAS
/* -------- */
export * from './schema/hub';

/* ----------------- */
// USER API SCHEMAS - AVOID CIRCULAR DEPENDENCIES
/* -------- */

// ZOD
import { z } from 'zod';
import { UserBase, UserUpdate, UserBasic, UserCurrent } from './schema/user';
import { UserLayerBase, UserLayerUpdate, UserLayerInsert } from './schema/layer';
import {
  UserFeatureBase,
  UserFeatureInsert,
  UserFeatureUpdate
} from './schema/feature';
import { OrganisationRoleBase } from './schema/organisation';
import { ProjectRoleBase } from './schema/project';

export const UserAPI = UserBasic.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase)
});

export const UserCollectionAPI = UserBasic.extend({
  email: z.string().email().nullish()
});

export const UserCurrentAPI = UserCurrent.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase),
  roles: z.array(z.union([OrganisationRoleBase, ProjectRoleBase])),
  superAdmin: z.boolean().nullish(),
  experimental: z.object({
    contributorMode: z.boolean(),
    noLabelsMode: z.boolean()
  })
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
  featureId: z.string()
  // These are optional for the response shape
  // user: UserBase.optional(),
  // feature: z.lazy(() => FeatureBase).optional()
});

export const UserBaseRaw = UserBase.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase),
  memberships: z.array(OrganisationRoleBase),
  projectRoles: z.array(ProjectRoleBase)
});
