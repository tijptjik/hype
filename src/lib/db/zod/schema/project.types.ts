import type { z } from 'zod'
import type {
  ApplyChangedRelationFieldParams,
  ChangedRelationResolution,
  EntityResponse,
  ResolveChangedRelationParams,
  ResourceSubmitDraft,
  ResourceSubmitMode,
  User,
} from '$lib/types'
import type {
  GetQueryParamsSchema,
  ListQueryParamsSchema,
} from '$lib/db/zod/schema/api'
import type {
  ProjectAdminProfileAPI,
  ProjectAdminRow,
  ProjectBase,
  ProjectCardProfileAPI,
  ProjectCardRow,
  ProjectDetailProfileAPI,
  ProjectEntityFormData,
  ProjectFormData,
  ProjectI18nBase,
  ProjectI18nInsert,
  ProjectI18nUpdate,
  ProjectInsert,
  ProjectListProfileAPI,
  ProjectListRow,
  ProjectPreflightFormData,
  ProjectProfile as ProjectProfileSchema,
  ProjectRoleAPI,
  ProjectRoleBase,
  ProjectRoleInsert,
  ProjectRoleUpdate,
  ProjectRoleUpdateExtra,
  ProjectRoleWithUser,
  ProjectUpdate,
  PublishProjectSchema,
  RemoveProjectSchema,
} from '$lib/db/zod/schema/project'

export type ProjectDB = z.infer<typeof ProjectBase>
export type ProjectDBNew = z.infer<typeof ProjectInsert>
export type ProjectDBPartial = z.infer<typeof ProjectUpdate>

export type Project = z.infer<typeof ProjectAdminProfileAPI>
export type ProjectNew = z.infer<typeof ProjectEntityFormData>
export type ProjectPartial = Partial<ProjectNew>
export type ProjectListParams = z.infer<typeof ListQueryParamsSchema>
export type ProjectGetParams = z.infer<typeof GetQueryParamsSchema>
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>
export type ProjectListProfile = z.infer<typeof ProjectListProfileAPI>
export type ProjectCardProfile = z.infer<typeof ProjectCardProfileAPI>
export type ProjectDetailProfile = z.infer<typeof ProjectDetailProfileAPI>

export type ProjectListDBRaw = z.infer<typeof ProjectListRow>
export type ProjectCardDBRaw = z.infer<typeof ProjectCardRow>
export type ProjectAdminDBRaw = z.infer<typeof ProjectAdminRow>
export type ProjectQueryRowByProfile<P extends ProjectProfile> = P extends 'admin'
  ? ProjectAdminDBRaw
  : P extends 'card' | 'detail'
    ? ProjectCardDBRaw
    : ProjectListDBRaw

export type ProjectEntityByProfile<P extends ProjectProfile> = P extends 'list'
  ? ProjectListProfile
  : P extends 'card'
    ? ProjectCardProfile
    : P extends 'detail'
      ? ProjectDetailProfile
      : Project

export type ProjectListByProfile<P extends ProjectProfile> = P extends 'list'
  ? ProjectListProfile
  : P extends 'card'
    ? ProjectCardProfile
    : P extends 'detail'
      ? ProjectDetailProfile
      : Project

export type ProjectGetParamsByProfile<P extends ProjectProfile> = Omit<
  ProjectGetParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type ProjectListParamsByProfile<P extends ProjectProfile> = Omit<
  ProjectListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type ProjectFormInput = z.input<typeof ProjectFormData>
export type ProjectBooleanField = 'isPublished' | 'isArchived'
export type ProjectSubmitBaselineRelations = {
  capabilities?: ProjectFormInput['data']['capabilities']
  userRoles?: unknown
  properties?: ProjectFormInput['data']['properties']
}

export type ProjectSubmitUpdatesParams<TEntityResult, TListResult> = {
  projectId?: string | null
  entityQuery: TEntityResult
  listQuery: TListResult
}

export type ProjectOwnerRoleSeedOrganisation = {
  data?: {
    userRoles?: Array<{
      userId: string
      role: string
      user?: User | null
    }>
  } | null
} | null

export type ProjectGetResponse = EntityResponse<Project>
export type ProjectGetState = ProjectGetResponse | null
export type ProjectPublishInput = z.input<typeof PublishProjectSchema>
export type ProjectArchiveInput = z.input<typeof RemoveProjectSchema>
export type ProjectPreflightInput = z.input<typeof ProjectPreflightFormData>

export type ProjectCurrentFormDraft = {
  data?: {
    capabilities?: unknown
    userRoles?: unknown
    properties?: unknown
  }
}

export type ProjectSubmitDraft = ResourceSubmitDraft<{
  capabilities?: unknown
  userRoles?: unknown
  properties?: unknown
}>

export type ProjectI18nDB = z.infer<typeof ProjectI18nBase>
export type ProjectI18nNew = z.infer<typeof ProjectI18nInsert>
export type ProjectI18nPartial = z.infer<typeof ProjectI18nUpdate>
export type ProjectI18n = z.infer<typeof ProjectI18nBase>

export type ProjectRole = z.infer<typeof ProjectRoleAPI>
export type ProjectRoleUser = z.infer<typeof ProjectRoleWithUser>
export type ProjectRoleDB = z.infer<typeof ProjectRoleBase>
export type ProjectRoleNew = z.infer<typeof ProjectRoleInsert>
export type ProjectRolePartial = z.infer<typeof ProjectRoleUpdate>
export type ProjectRolePartialExtra = z.infer<typeof ProjectRoleUpdateExtra>

export type SubmittedPropertyScopeCandidate = {
  id?: unknown
  scope?: unknown
}

export type ProjectInheritedPropertySyncCandidate = SubmittedPropertyScopeCandidate & {
  isEnabled?: unknown
  isDefaultEnabled?: unknown
}

export type ProjectInheritedPropertySyncItem = {
  id: string
  scope: string
  isEnabled?: boolean
  isDefaultEnabled?: boolean
}

export type ProjectLocalPropertyCandidate = {
  id?: unknown
  projectId?: unknown
  hubId?: unknown
  scope?: unknown
  isEnabled?: unknown
}

export type PersistedProjectLocalPropertyCandidate = {
  id: string
  scope?: unknown
  projectId?: unknown
  hubId?: unknown
}

export type ProjectCapabilities = Record<
  'manageBakeries' | 'manageVolunteers' | 'manageDropOffs',
  boolean
>

export type ProjectRoleCapabilities = Partial<ProjectCapabilities>

export type ProjectDBRaw = ProjectAdminDBRaw

export type ProjectCapabilityKey = keyof ProjectCapabilities

export type ProjectChangedRelationResolution<TEffective> =
  ChangedRelationResolution<TEffective>
export type ProjectResolveChangedRelationParams<TEffective> =
  ResolveChangedRelationParams<TEffective>
export type ProjectApplyChangedRelationFieldParams<
  TData extends Record<string, unknown>,
  TKey extends keyof TData,
  TEffective,
> = ApplyChangedRelationFieldParams<TData, TKey, TEffective>
export type ProjectSubmitMode = ResourceSubmitMode
