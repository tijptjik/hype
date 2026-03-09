import type { z } from 'zod'
import type {
  EntityResponse,
  FormLocaleInput,
  FormLocaleSource,
  Locale,
} from '$lib/types'
import type {
  GetQueryParamsSchema,
  ListQueryParamsSchema,
} from '$lib/db/zod/schema/api'
import type {
  HubAdminProfileAPI,
  HubBase,
  HubCardProfileAPI,
  HubDetailProfileAPI,
  HubEntityFormData,
  HubFormData,
  HubI18nBase,
  HubI18nInsert,
  HubI18nUpdate,
  HubInsert,
  HubListProfileAPI,
  HubPreflightFormData,
  HubProfile as HubProfileSchema,
  HubRaw,
  HubRoleBase,
  HubRoleInsert,
  HubRoleUpdate,
  HubRoleWithUser,
  HubUpdate,
  PublishHubSchema,
  RemoveHubSchema,
} from '$lib/db/zod/schema/hub'

export type HubDB = z.infer<typeof HubBase>
export type HubDBNew = z.infer<typeof HubInsert>
export type HubDBPartial = z.infer<typeof HubUpdate>

export type Hub = z.infer<typeof HubAdminProfileAPI>
export type HubNew = z.infer<typeof HubEntityFormData>
export type HubPartial = Partial<HubNew>

export type HubListParams = z.infer<typeof ListQueryParamsSchema>
export type HubGetParams = z.infer<typeof GetQueryParamsSchema>
export type HubProfile = z.infer<typeof HubProfileSchema>
export type HubListProfile = z.infer<typeof HubListProfileAPI>
export type HubCardProfile = z.infer<typeof HubCardProfileAPI>
export type HubDetailProfile = z.infer<typeof HubDetailProfileAPI>
export type HubAdminProfile = z.infer<typeof HubAdminProfileAPI>

export type HubEntityByProfile<P extends HubProfile> = P extends 'list'
  ? HubListProfile
  : P extends 'card'
    ? HubCardProfile
    : P extends 'detail'
      ? HubDetailProfile
      : HubAdminProfile

export type HubListByProfile<P extends HubProfile> = P extends 'list'
  ? HubListProfile
  : P extends 'card'
    ? HubCardProfile
    : P extends 'detail'
      ? HubDetailProfile
      : HubAdminProfile

export type HubGetParamsByProfile<P extends HubProfile> = Omit<HubGetParams, 'meta'> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type HubListParamsByProfile<P extends HubProfile> = Omit<
  HubListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type HubDBRaw = z.infer<typeof HubRaw>
export type HubI18nDB = z.infer<typeof HubI18nBase>
export type HubI18nNew = z.infer<typeof HubI18nInsert>
export type HubI18nPartial = z.infer<typeof HubI18nUpdate>
export type HubRole = z.infer<typeof HubRoleBase>
export type HubRoleDB = z.infer<typeof HubRoleBase>
export type HubRoleNew = z.infer<typeof HubRoleInsert>
export type HubRolePartial = z.infer<typeof HubRoleUpdate>
export type HubRoleUser = z.infer<typeof HubRoleWithUser>

export type HubFormInput = z.input<typeof HubFormData>
export type HubFormLocaleInput = FormLocaleInput<HubFormInput>
export type HubFormLocaleSource = FormLocaleSource<HubFormInput>
export type HubPreflightInput = z.input<typeof HubPreflightFormData>
export type HubBooleanField = 'isPublished' | 'isArchived'
export type HubPublishInput = z.input<typeof PublishHubSchema>
export type HubArchiveInput = z.input<typeof RemoveHubSchema>
export type HubIdentityPatch = {
  code: string
  locale: Locale
  name: string
  nameShort: string
}
export type HubGetResponse = EntityResponse<HubEntityByProfile<'admin'>>
export type HubGetState = HubGetResponse | null
