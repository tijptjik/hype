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

/* ----------------- */
// PROJECT SCHEMAS
/* -------- */
export * from './schema/project'

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

/* ----------------- */
// USER API SCHEMAS - AVOID CIRCULAR DEPENDENCIES
/* -------- */

// ZOD
import { z } from 'zod'
import { UserBase } from './schema/user'
import { UserLayerRecord, UserLayerRecordUpdate } from './schema/layer'
import { UserFeatureBase, UserFeatureUpdate } from './schema/feature'
import { OrganisationRoleBase } from './schema/organisation'
import { ProjectRoleBase } from './schema/project'
import { HubRoleBase } from './schema/hub'

export const UserLayerDetailProfileAPI = UserLayerRecord.extend({
  user: UserBase.optional(),
  layer: UserLayerRecord.optional(),
})

// There is no UserInsertAPI because users are created by AuthJS

export const SetUserLayerDefaultsItemSchema = UserLayerRecordUpdate.extend({
  // These are required for the upsert operation
  userId: z.string(),
  layerId: z.string(),
  // These are optional for the response shape
  user: UserBase.optional(),
  layer: UserLayerRecord.optional(),
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
  userLayers: z.array(UserLayerRecord),
  userFeatures: z.array(UserFeatureBase),
  hubRoles: z.array(HubRoleBase),
  organisationRoles: z.array(OrganisationRoleBase),
  projectRoles: z.array(ProjectRoleBase),
})
