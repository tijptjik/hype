// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { user } from '$lib/db/schema/user'
// CONSTRAINTS
// import { FeatureBase } from './feature';

/* ============================================================================
 * USER SCHEMAS
 * ============================================================================
 */

// Define JSON object schemas for user fields
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

export const UserBase = createSelectSchema(user)
export const UserBasic = UserBase.pick({
  id: true,
  name: true,
  image: true,
  attribution: true,
} as const)
export const UserProfileAPI = UserBase.pick({
  id: true,
  name: true,
  username: true,
  displayUsername: true,
  image: true,
  attribution: true,
  createdAt: true,
} as const).extend({
  contributedFeatures: z.record(z.string(), z.array(z.string())),
  contributedImages: z.record(z.string(), z.array(z.string())),
  reportedMissingCount: z.number(),
  newPhotoCount: z.number(),
  newFeatureCount: z.number(),
  superAdmin: z.boolean().nullish(),
})
export const UserCurrent = UserBase.pick({
  id: true,
  name: true,
  username: true,
  displayUsername: true,
  image: true,
  attribution: true,
  locale: true,
  preferences: true,
  experimental: true,
  isAnonymous: true,
} as const).extend({
  // Override JSON fields with proper types - transform strings to objects
  preferences: z.string().transform(str => {
    try {
      const parsed = JSON.parse(str)
      return UserPreferencesSchema.parse(parsed)
    } catch {
      return UserPreferencesSchema.parse({})
    }
  }),
  experimental: z.string().transform(str => {
    try {
      const parsed = JSON.parse(str)
      return UserExperimentalSchema.parse(parsed)
    } catch {
      return UserExperimentalSchema.parse({})
    }
  }),
})

export const UserUpdate = createUpdateSchema(user)

/* ----------------- */
// USER SEARCH SCHEMAS
/* -------- */

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
    profile: z.enum(['privacy', 'admin']).optional(),
  })
  .optional()

export const UserHydrationSchema = z.object({
  id: z.string().min(1),
  meta: UserHydrationMetaSchema,
})

export const UserHydrationPrivacyProfileAPI = UserBase.pick({
  id: true,
  attribution: true,
})

const UserHydrationAdminFields = UserBase.pick({
  name: true,
  image: true,
})

export const UserHydrationAdminProfileAPI = UserHydrationPrivacyProfileAPI.extend({
  ...UserHydrationAdminFields.shape,
})
