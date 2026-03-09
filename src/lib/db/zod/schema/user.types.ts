import type { z } from 'zod'
import type {
  EntityResponse,
  FeatureFromCollection,
  Locale,
  ResourceContext,
  UserRoleDisco,
} from '$lib/types'
import type {
  UserFeatureAPI,
  UserFeatureBase,
  UserFeatureInsert,
  UserFeatureInsertAPI,
  UserFeatureUpdate,
} from '$lib/db/zod/schema/feature'
import type {
  UserAdminListProfileAPI,
  UserAdminProfileAPI,
  UserAttributionProfileAPI,
  UserBase,
  UserCardProfileAPI,
  UserDetailProfileAPI,
  UserFeatureListProfileAPI,
  UserHydrationAttributionProfileAPI,
  UserHydrationCardProfileAPI,
  UserLeaderboardProfileAPI,
  UserProfile as UserProfileSchema,
  UserSearchQueryParamsSchema,
  UserSelfProfileAPI,
  UserUpdate,
  UserUpdateAPI,
} from '$lib/db/zod/schema/user'
import type {
  SetUserLayerDefaultsItemSchema,
  UserBaseRaw,
  UserFeatureUpdateAPI,
  UserLayerDetailProfileAPI,
} from '$lib/db/zod'
import type {
  UserLayerRecord,
  UserLayerRecordCreate,
  UserLayerRecordUpdate,
} from '$lib/db/zod/schema/layer'

export type UserRoleEntityType = 'hub' | 'organisation' | 'project'
export type UserParentEntityType = 'organisation' | 'project'

export type UserRoleFilter = {
  entityType: UserRoleEntityType
  entityId: string
  role?: string
  roles?: string[]
  anyRole?: boolean
}

export type UserParentChainRoleFilter = {
  fromEntityType: UserParentEntityType
  fromEntityId: string
  role?: string
  roles?: string[]
  anyRole?: boolean
}

export type UserSearchQueryParams = z.input<typeof UserSearchQueryParamsSchema>
export type UserSearchQueryOptions = Omit<UserSearchQueryParams, 'q'>

export type UserDB = z.infer<typeof UserBase>
export type UserDBPartial = z.infer<typeof UserUpdate>
export type UserRaw = z.infer<typeof UserBaseRaw>

export type User = z.infer<typeof UserAdminProfileAPI>
export type CurrentUser = z.infer<typeof UserSelfProfileAPI> & {
  userLayers: UserLayer[]
  userFeatures?: UserFeature[]
  roles?: UserRoleDisco[]
  superAdmin?: boolean | null
}
export type UserProfile = z.infer<typeof UserDetailProfileAPI>
export type UserCollection = z.infer<typeof UserAdminListProfileAPI>
export type UserPartial = z.infer<typeof UserUpdateAPI>
export type UserAttributionProfile = z.infer<typeof UserAttributionProfileAPI>
export type UserAdminListProfile = z.infer<typeof UserAdminListProfileAPI>
export type UserCardProfile = z.infer<typeof UserCardProfileAPI>
export type UserLeaderboardProfile = z.infer<typeof UserLeaderboardProfileAPI>
export type UserDetailProfile = z.infer<typeof UserDetailProfileAPI>
export type UserSelfProfile = z.infer<typeof UserSelfProfileAPI>
export type UserAdminProfile = z.infer<typeof UserAdminProfileAPI>
export type UserProfileKey = z.infer<typeof UserProfileSchema>
export type UserEntityByProfile<P extends UserProfileKey> = P extends 'attribution'
  ? UserAttributionProfile
  : P extends 'adminList'
    ? UserAdminListProfile
    : P extends 'card'
      ? UserCardProfile
      : P extends 'leaderboard'
        ? UserLeaderboardProfile
        : P extends 'self'
          ? UserSelfProfile
          : P extends 'admin'
            ? UserAdminProfile
            : UserDetailProfile

export type UserLayerDB = z.infer<typeof UserLayerRecord>
export type UserLayerDBPartial = z.infer<typeof UserLayerRecordUpdate>
export type UserLayer = z.infer<typeof UserLayerDetailProfileAPI>
export type UserLayerNew = z.infer<typeof UserLayerRecordCreate>
export type UserLayerPartial = z.infer<typeof SetUserLayerDefaultsItemSchema>

export type UserHydrationProfile = 'attribution' | 'card'
export type UserHydrationPrivacyProfile = z.infer<
  typeof UserHydrationAttributionProfileAPI
>
export type UserHydrationAdminProfile = z.infer<typeof UserHydrationCardProfileAPI>
export type UserHydrationEntityByProfile<P extends UserHydrationProfile> =
  P extends 'card' ? UserHydrationAdminProfile : UserHydrationPrivacyProfile
export type UserHydrationResult =
  | UserHydrationPrivacyProfile
  | UserHydrationAdminProfile
  | null

export type AdminPreferences = {
  isAdminMapCollapsed?: boolean
  isPrimaryPanelCollapsed?: boolean
  isPrimaryPanelAutoHide?: boolean
}

export type AdminPreferenceCode =
  | 'isAdminMapCollapsed'
  | 'isPrimaryPanelCollapsed'
  | 'isPrimaryPanelAutoHide'

export type UserPreferences = {
  fallbackLocales: Locale[]
  allowMachineTranslation: boolean
  preferFallbackInCurrentLocale: boolean
  isTranslateButtonVisible: boolean
  admin?: AdminPreferences
}

export type UserExperimental = {
  contributorMode: boolean
  noLabelsMode: boolean
}

export type ExperimentalFeatureConfig = {
  name: string
  description: string
  code: keyof UserExperimental
}

export type UserFeatureDB = z.infer<typeof UserFeatureBase>
export type UserFeatureDBNew = z.infer<typeof UserFeatureInsert>
export type UserFeatureDBPartial = z.infer<typeof UserFeatureUpdate>
export type UserFeature = z.infer<typeof UserFeatureAPI>
export type UserFeatureListItem = z.infer<typeof UserFeatureListProfileAPI>
export type UserFeatureNew = z.infer<typeof UserFeatureInsertAPI>
export type UserFeaturePartial = z.infer<typeof UserFeatureUpdateAPI>
export type UserFeatureWithHierarchy = UserFeature & {
  feature: FeatureFromCollection
  hierarchy: ResourceContext
}

export type UserGetResponse = EntityResponse<User>
export type UserGetState = UserGetResponse | null
