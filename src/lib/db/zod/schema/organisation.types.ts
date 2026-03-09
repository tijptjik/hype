import type { z } from 'zod'
import type {
  CapabilityDefinitions,
  EntityResponse,
  FormLocaleInput,
  FormLocaleSource,
  Locale,
  QueryWithOverride,
} from '$lib/types'
import type {
  GetQueryParams,
  ListQueryParams,
} from '$lib/db/zod/schema/api.types'
import type {
  OrganisationAdminProfileAPI,
  OrganisationBase,
  OrganisationCardProfileAPI,
  OrganisationDetailProfileAPI,
  OrganisationEntityFormData,
  OrganisationFormData,
  OrganisationI18nBase,
  OrganisationI18nInsert,
  OrganisationI18nUpdate,
  OrganisationInsert,
  OrganisationListProfileAPI,
  OrganisationPreflightFormData,
  OrganisationProfile as OrganisationProfileSchema,
  OrganisationRaw,
  OrganisationRoleAPI,
  OrganisationRoleBase,
  OrganisationRoleInsert,
  OrganisationRoleUpdate,
  OrganisationRoleUpdateExtra,
  OrganisationRoleWithUser,
  OrganisationUpdate,
  PublishOrganisationSchema,
  RemoveOrganisationSchema,
} from '$lib/db/zod/schema/organisation'

export type OrganisationDB = Omit<z.infer<typeof OrganisationBase>, 'isCoreInclusive'>
export type OrganisationDBSuperAdmin = z.infer<typeof OrganisationBase>
export type OrganisationDBNew = z.infer<typeof OrganisationInsert>
export type OrganisationDBPartial = z.infer<typeof OrganisationUpdate>

export type Organisation = z.infer<typeof OrganisationAdminProfileAPI>
export type OrganisationNew = z.infer<typeof OrganisationEntityFormData>
export type OrganisationNewWithI18n = Omit<OrganisationNew, 'i18n'> & {
  i18n: Record<Locale, OrganisationI18nNew>
}
export type OrganisationWithI18n = Omit<Organisation, 'i18n'> & {
  i18n: Record<Locale, OrganisationI18nPartial>
}
export type OrganisationPartial = Partial<OrganisationNew>

export type OrganisationListParams = ListQueryParams
export type OrganisationGetParams = GetQueryParams
export type OrganisationProfile = z.infer<typeof OrganisationProfileSchema>
export type OrganisationListProfile = z.infer<typeof OrganisationListProfileAPI>
export type OrganisationCardProfile = z.infer<typeof OrganisationCardProfileAPI>
export type OrganisationDetailProfile = z.infer<typeof OrganisationDetailProfileAPI>
export type OrganisationAdminProfile = z.infer<typeof OrganisationAdminProfileAPI>

export type OrganisationEntityByProfile<P extends OrganisationProfile> =
  P extends 'list'
    ? OrganisationListProfile
    : P extends 'card'
      ? OrganisationCardProfile
      : P extends 'detail'
        ? OrganisationDetailProfile
        : OrganisationAdminProfile

export type OrganisationListByProfile<P extends OrganisationProfile> = P extends 'list'
  ? OrganisationListProfile
  : P extends 'card'
    ? OrganisationCardProfile
    : P extends 'detail'
      ? OrganisationDetailProfile
      : OrganisationAdminProfile

export type OrganisationGetParamsByProfile<P extends OrganisationProfile> = Omit<
  OrganisationGetParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type OrganisationListParamsByProfile<P extends OrganisationProfile> = Omit<
  OrganisationListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type OrganisationFormInput = z.input<typeof OrganisationFormData>
export type OrganisationFormLocaleInput = FormLocaleInput<OrganisationFormInput>
export type OrganisationFormLocaleSource = FormLocaleSource<OrganisationFormInput>
export type OrganisationPropertySource = NonNullable<
  OrganisationFormInput['data']['properties']
>[number]
export type OrganisationFormSource = {
  id?: string
  modifiedAt?: string
  code?: string
  url?: string | null
  capabilities?: CapabilityDefinitions | null
  i18n?: Partial<
    Record<'en' | 'zhHans' | 'zhHant', OrganisationFormLocaleSource>
  > | null
  userRoles?: Array<{ userId?: string; role?: string }>
  properties?: OrganisationPropertySource[] | null
}
export type OrganisationBooleanField = 'isPublished' | 'isArchived'
export type OrganisationIdentityPatch = {
  code: string
  locale: Locale
  name: string
  nameShort: string
}

export type OrganisationSubmitUpdatesParams<
  TEntityCurrent,
  TListCurrent,
  TEntityResult,
  TListResult,
> = {
  data: OrganisationFormInput
  locale: Locale
  organisationId?: string | null
  entityQuery: QueryWithOverride<TEntityCurrent, TEntityResult>
  listQuery: QueryWithOverride<TListCurrent, TListResult>
}

export type OrganisationGetResponse = EntityResponse<
  OrganisationEntityByProfile<'admin'>
>
export type OrganisationGetState = OrganisationGetResponse | null
export type OrganisationPreflightInput = z.input<typeof OrganisationPreflightFormData>
export type OrganisationPublishInput = z.input<typeof PublishOrganisationSchema>
export type OrganisationArchiveInput = z.input<typeof RemoveOrganisationSchema>

export type OrganisationI18nDB = z.infer<typeof OrganisationI18nBase>
export type OrganisationI18nNew = z.infer<typeof OrganisationI18nInsert>
export type OrganisationI18nPartial = z.infer<typeof OrganisationI18nUpdate>

export type OrganisationRole = z.infer<typeof OrganisationRoleAPI>
export type OrganisationRoleUser = z.infer<typeof OrganisationRoleWithUser>
export type OrganisationRoleDB = z.infer<typeof OrganisationRoleBase>
export type OrganisationRoleNew = z.infer<typeof OrganisationRoleInsert>
export type OrganisationRolePartial = z.infer<typeof OrganisationRoleUpdate>
export type OrganisationRolePartialExtra = z.infer<typeof OrganisationRoleUpdateExtra>

export type OrganisationDBRaw = z.infer<typeof OrganisationRaw>
