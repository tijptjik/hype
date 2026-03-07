// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import {
  hubRole,
  organisationRole,
  projectRole,
  user,
  userFeature,
} from '$lib/db/schema/index'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SUPPORTING SCHEMAS
//    - UsernameSchema
//    - UserRoleDiscoSchema
//
// 2. DB / RELATIONAL PRIMITIVES
//    - UserBase
//    - UserBasic
//
// 3. REMOTE PROFILE SCHEMAS
//    - UserAttributionProfileAPI
//    - UserAdminListProfileAPI
//    - UserCardProfileAPI
//    - UserLeaderboardProfileAPI
//    - UserDetailProfileAPI
//    - UserSelfProfileAPI
//    - UserAdminProfileAPI
//    - UserProfile
//
// 4. REMOTE UPDATE SCHEMAS
//    - UserUpdate
//    - UserUpdateAPI
//
// 5. REMOTE QUERY / LOOKUP SCHEMAS
//    - UserSearchQueryParamsSchema
//    - UserHydrationSchema
//    - UserHydrationAttributionProfileAPI
//    - UserHydrationCardProfileAPI
//    - GetUserParamsSchema
//    - UpdateUserParamsSchema
//    - GetUserLayersParamsSchema
//    - SetUserLayerDefaultsSchema
//    - GetUserFeaturesParamsSchema
//    - UserFeatureListProfileAPI
//    - AddUserFeatureToListSchema
//    - RemoveUserFeatureFromListSchema

// ═══════════════════════
// 1. SUPPORTING SCHEMAS
// ═══════════════════════

const UserPreferencesSchema = z
  .object({
    fallbackLocales: z.array(z.string()).nullish(),
    allowMachineTranslation: z.boolean().nullish(),
    preferFallbackInCurrentLocale: z.boolean().nullish(),
    isTranslateButtonVisible: z.boolean().nullish(),
    admin: z
      .object({
        isAdminMapCollapsed: z.boolean().optional(),
        isPrimaryPanelCollapsed: z.boolean().optional(),
        isPrimaryPanelAutoHide: z.boolean().optional(),
      })
      .nullish(),
  })
  .prefault({
    fallbackLocales: ['en'],
    allowMachineTranslation: false,
    preferFallbackInCurrentLocale: false,
    isTranslateButtonVisible: true,
    admin: {},
  })

const UserExperimentalSchema = z
  .object({
    contributorMode: z.boolean().nullish(),
    noLabelsMode: z.boolean().nullish(),
  })
  .prefault({
    contributorMode: false,
    noLabelsMode: false,
  })
  .nullish()

const JsonStringWithFallback = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(value => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }, schema)

export const UsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_]+$/)

const HubRoleBase = createSelectSchema(hubRole)
const OrganisationRoleBase = createSelectSchema(organisationRole)
const ProjectRoleBase = createSelectSchema(projectRole)
const UserFeatureBase = createSelectSchema(userFeature)

export const UserRoleDiscoSchema = z.union([
  HubRoleBase.extend({
    type: z.literal('hub'),
  }),
  OrganisationRoleBase.extend({
    type: z.literal('organisation'),
  }),
  ProjectRoleBase.extend({
    type: z.literal('project'),
  }),
])

// ═══════════════════════
// 2. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const UserBase = createSelectSchema(user)

export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true,
} as const)

// ═══════════════════════
// 3. REMOTE PROFILE SCHEMAS
// ═══════════════════════

const UserContributionSummaryFields = z.object({
  contributedFeatures: z.record(z.string(), z.array(z.string())),
  contributedImages: z.record(z.string(), z.array(z.string())),
  reportedMissingCount: z.number(),
  newPhotoCount: z.number(),
  newFeatureCount: z.number(),
})

export const UserAttributionProfileAPI = UserBase.pick({
  id: true,
  username: true,
  attribution: true,
} as const)

export const UserAdminListProfileAPI = UserBase.pick({
  id: true,
  name: true,
  username: true,
  email: true,
  image: true,
} as const)

export const UserCardProfileAPI = UserBase.pick({
  id: true,
  username: true,
  image: true,
  attribution: true,
} as const)

export const UserLeaderboardProfileAPI = UserBase.pick({
  id: true,
  username: true,
} as const).extend({
  reportedMissingCount: z.number(),
  newPhotoCount: z.number(),
  newFeatureCount: z.number(),
})

export const UserDetailProfileAPI = UserCardProfileAPI.extend({
  contributedFeatures: UserContributionSummaryFields.shape.contributedFeatures,
  contributedImages: UserContributionSummaryFields.shape.contributedImages,
  reportedMissingCount: UserContributionSummaryFields.shape.reportedMissingCount,
  newPhotoCount: UserContributionSummaryFields.shape.newPhotoCount,
  newFeatureCount: UserContributionSummaryFields.shape.newFeatureCount,
})

export const UserSelfProfileAPI = UserBase.pick({
  id: true,
  name: true,
  username: true,
  image: true,
  attribution: true,
  locale: true,
  preferences: true,
  experimental: true,
  isAnonymous: true,
} as const).extend({
  preferences: JsonStringWithFallback(UserPreferencesSchema),
  experimental: JsonStringWithFallback(UserExperimentalSchema),
})

export const UserAdminProfileAPI = UserAdminListProfileAPI.extend({
  attribution: UserSelfProfileAPI.shape.attribution,
  locale: UserSelfProfileAPI.shape.locale,
  preferences: UserSelfProfileAPI.shape.preferences,
  experimental: UserSelfProfileAPI.shape.experimental,
  isAnonymous: UserSelfProfileAPI.shape.isAnonymous,
  contributedFeatures: UserDetailProfileAPI.shape.contributedFeatures,
  contributedImages: UserDetailProfileAPI.shape.contributedImages,
  reportedMissingCount: UserDetailProfileAPI.shape.reportedMissingCount,
  newPhotoCount: UserDetailProfileAPI.shape.newPhotoCount,
  newFeatureCount: UserDetailProfileAPI.shape.newFeatureCount,
  roles: z.array(UserRoleDiscoSchema),
  createdAt: UserBase.shape.createdAt,
  modifiedAt: UserBase.shape.updatedAt,
})

export const UserProfile = z.enum([
  'attribution',
  'adminList',
  'card',
  'leaderboard',
  'detail',
  'self',
  'admin',
])

// ═══════════════════════
// 4. REMOTE UPDATE SCHEMAS
// ═══════════════════════

export const UserUpdate = createUpdateSchema(user).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const UserUpdateAPI = UserUpdate.extend({
  username: UsernameSchema.optional(),
})

// ═══════════════════════
// 5. REMOTE QUERY / LOOKUP SCHEMAS
// ═══════════════════════

export const UserRoleFilterSchema = z
  .object({
    entityType: z.enum(['hub', 'organisation', 'project']),
    entityId: z.string().min(1),
    role: z.string().trim().min(1).optional(),
    roles: z.array(z.string().trim().min(1)).optional(),
    anyRole: z.boolean().optional(),
  })
  .refine(
    value => Boolean(value.anyRole || value.role || (value.roles?.length ?? 0) > 0),
    'At least one role selector must be provided',
  )

export const UserParentChainRoleFilterSchema = z
  .object({
    fromEntityType: z.enum(['organisation', 'project']),
    fromEntityId: z.string().min(1),
    role: z.string().trim().min(1).optional(),
    roles: z.array(z.string().trim().min(1)).optional(),
    anyRole: z.boolean().optional(),
  })
  .refine(
    value => Boolean(value.anyRole || value.role || (value.roles?.length ?? 0) > 0),
    'At least one role selector must be provided',
  )

export const UserSearchQueryParamsSchema = z.object({
  q: z.string().trim().optional(),
  conditions: z
    .object({
      isArchived: z.boolean().nullable().optional(),
    })
    .optional(),
  pagination: z
    .object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    })
    .optional(),
  sorting: z
    .object({
      sortBy: z.enum(['name', 'email', 'createdAt', 'updatedAt']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
  roleOnEntity: UserRoleFilterSchema.optional(),
  roleUpParentChain: UserParentChainRoleFilterSchema.optional(),
})

/* ----------------- */
// USER HYDRATION SCHEMAS
/* -------- */

export const UserHydrationMetaSchema = z
  .object({
    isAdminRequest: z.boolean().optional(),
    profile: z.enum(['attribution', 'card']).optional(),
  })
  .optional()

export const UserHydrationSchema = z.object({
  id: z.string().min(1),
  meta: UserHydrationMetaSchema,
})

export const UserHydrationAttributionProfileAPI = UserAttributionProfileAPI

export const UserHydrationCardProfileAPI = UserCardProfileAPI.extend({
  name: UserBase.shape.name,
})

/* ----------------- */
// USER RELATION REMOTE CONTRACT SCHEMAS
/* -------- */

const UserRemoteMetaSchema = z
  .object({
    isAdminRequest: z.coerce.boolean<boolean>().optional(),
    profile: UserProfile.optional(),
  })
  .optional()

export const GetUserParamsSchema = z.object({
  ref: z.string().min(1),
  refKey: z.enum(['id', 'username']).optional(),
  meta: UserRemoteMetaSchema,
})

export const UpdateUserParamsSchema = z.object({
  id: z.string().min(1),
  data: UserUpdateAPI,
  meta: UserRemoteMetaSchema,
})

export const GetUserLayersParamsSchema = z.object({
  userId: z.string().min(1).optional(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

const UserLayerDefaultsItemSchema = z.object({
  layerId: z.string().min(1),
  isVisibleOnLoad: z.boolean(),
})

export const SetUserLayerDefaultsSchema = z.object({
  userId: z.string().min(1).optional(),
  layers: z.array(UserLayerDefaultsItemSchema).default([]),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const GetUserFeaturesParamsSchema = z.object({
  userId: z.string().min(1).optional(),
  conditions: z
    .object({
      isVisited: z.boolean().nullable().optional(),
      isWishlisted: z.boolean().nullable().optional(),
    })
    .optional(),
  pagination: z
    .object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    })
    .optional(),
  sorting: z
    .object({
      sortBy: z.enum(['visitedAt', 'createdAt', 'modifiedAt']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const UserFeatureListProfileAPI = UserFeatureBase.pick({
  featureId: true,
  isVisited: true,
  isWishlisted: true,
  visitedAt: true,
})

export const AddUserFeatureToListSchema = z.object({
  userId: z.string().min(1).optional(),
  featureId: z.string().min(1),
  list: z.enum(['wishlist', 'visited']),
  visitedAt: z.string().optional().nullable(),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})

export const RemoveUserFeatureFromListSchema = z.object({
  userId: z.string().min(1).optional(),
  featureId: z.string().min(1),
  list: z.enum(['wishlist', 'visited']),
  meta: z
    .object({
      isAdminRequest: z.coerce.boolean<boolean>().optional(),
    })
    .optional(),
})
