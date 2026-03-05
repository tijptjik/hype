/* ----------------- */
// CONSTRAINTS & UTILITIES
/* -------- */
export * from './constraints'
export * from './form'

/* ----------------- */
// GENERIC API SCHEMAS
/* -------- */
export * from './schema/api'

/* ----------------- */
// USER SCHEMAS
/* -------- */
export * from './schema/user'

/* ----------------- */
// ORGANISATION SCHEMAS
/* -------- */
export * from './schema/organisation'
export * from './schema/deprecated/organisation'

/* ----------------- */
// PROJECT SCHEMAS
/* -------- */
export * from './schema/project'
export * from './schema/deprecated/project'

/* ----------------- */
// LAYER SCHEMAS
/* -------- */
export * from './schema/layer'

/* ----------------- */
// FEATURE SCHEMAS
/* -------- */
export * from './schema/feature'

/* ----------------- */
// PROPERTY SCHEMAS
/* -------- */
export * from './schema/property'
export * from './schema/deprecated/property'

/* ----------------- */
// TASK SCHEMAS
/* -------- */
export * from './schema/task'

/* ----------------- */
// IMAGE SCHEMAS
/* -------- */
export * from './schema/image'

/* ----------------- */
// HUB SCHEMAS
/* -------- */
export * from './schema/hub'
export * from './schema/deprecated/hub'

/* ----------------- */
// USER API SCHEMAS - AVOID CIRCULAR DEPENDENCIES
/* -------- */

// ZOD
import { z } from 'zod'
import { UserBase, UserUpdate, UserBasic, UserCurrent } from './schema/user'
import { UserLayerBase, UserLayerUpdate, UserLayerInsert } from './schema/layer'
import { UserFeatureBase, UserFeatureInsert, UserFeatureUpdate } from './schema/feature'
import { OrganisationRoleBase } from './schema/deprecated/organisation'
import { ProjectRoleBase } from './schema/deprecated/project'
import { HubRoleBase } from './schema/deprecated/hub'

export const UserAPI = UserBasic.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase),
})

export const UserCollectionAPI = UserBasic.extend({
  email: z.email().nullish(),
})

export const UserCurrentAPI = UserCurrent.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase),
  roles: z.array(z.union([OrganisationRoleBase, ProjectRoleBase])),
  superAdmin: z.boolean().nullish(),
  // Contributor data - arrays of IDs for published content
  contributedFeatures: z.array(z.string()),
  contributedImages: z.array(z.string()),
  reportedMissingCount: z.number(),
  newPhotoCount: z.number(),
  newFeatureCount: z.number(),
})

export const UserLayerAPI = UserLayerBase.extend({
  user: UserBase.optional(),
  layer: UserLayerBase.optional(),
})

// There is no UserInsertAPI because users are created by AuthJS

export const UserUpdateAPI = UserUpdate.extend({
  userLayers: z.array(UserLayerInsert).optional(), // Fully specified, but optional.
  userFeatures: z.array(UserFeatureInsert).optional(),
})

export const UserLayerUpdateAPI = UserLayerUpdate.extend({
  // These are required for the upsert operation
  userId: z.string(),
  layerId: z.string(),
  // These are optional for the response shape
  user: UserBase.optional(),
  layer: UserLayerBase.optional(),
})

export const UserFeatureUpdateAPI = UserFeatureUpdate.extend({
  // These are required for the upsert operation
  userId: z.string(),
  featureId: z.string(),
  // These are optional for the response shape
  // user: UserBase.optional(),
  // feature: z.lazy(() => FeatureBase).optional()
})

export const UserBaseRaw = UserBase.extend({
  userLayers: z.array(UserLayerBase),
  userFeatures: z.array(UserFeatureBase),
  hubRoles: z.array(HubRoleBase),
  organisationRoles: z.array(OrganisationRoleBase),
  projectRoles: z.array(ProjectRoleBase),
})
