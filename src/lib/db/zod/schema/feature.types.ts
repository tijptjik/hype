import type { z } from 'zod'
import type {
  ApplyChangedRelationFieldParams,
  ChangedRelationResolution,
  EntityResponse,
  Id,
  Locale,
  LocaleKey,
  NewFeatureTask,
  PartialExcept,
  ResolveChangedRelationParams,
  ResourceSubmitMode,
} from '$lib/types'
import type { GetQueryParams, ListQueryParams } from '$lib/db/zod/schema/api.types'
import type {
  FeatureAdminProfileAPI,
  FeatureAdminRow,
  FeatureBase,
  FeatureCardProfileAPI,
  FeatureCardRow,
  FeatureDetailProfileAPI,
  FeatureEntityFormData,
  FeatureFormData,
  FeatureI18nBase,
  FeatureI18nInsert,
  FeatureI18nUpdate,
  FeatureInsert,
  FeatureListProfileAPI,
  FeatureListRow,
  FeaturePreflightFormData,
  FeatureProfile as FeatureProfileSchema,
  FeaturePropertyAPI,
  FeaturePropertyBase,
  FeaturePropertyFormData,
  FeaturePropertyCollectionAPI,
  FeaturePropertyI18nBase,
  FeaturePropertyI18nInsert,
  FeaturePropertyI18nUpdate,
  FeaturePropertyInsert,
  FeaturePropertyUpdate,
  FeatureUpdate,
  UserFeatureBase,
  UserFeatureInsert,
  UserFeatureUpdate,
  PublishFeatureSchema,
  RemoveFeatureSchema,
} from '$lib/db/zod/schema/feature'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Geometry } from 'geojson'

export type FeatureListParams = ListQueryParams
export type FeatureGetParams = GetQueryParams
export type FeatureProfile = z.infer<typeof FeatureProfileSchema>
export type FeatureListProfile = z.infer<typeof FeatureListProfileAPI>
export type FeatureCardProfile = z.infer<typeof FeatureCardProfileAPI>
export type FeatureDetailProfile = z.infer<typeof FeatureDetailProfileAPI>
export type FeatureAdminProfile = z.infer<typeof FeatureAdminProfileAPI>

export type FeatureEntityByProfile<P extends FeatureProfile> = P extends 'list'
  ? FeatureListProfile
  : P extends 'card'
    ? FeatureCardProfile
    : P extends 'detail'
      ? FeatureDetailProfile
      : FeatureAdminProfile

export type FeatureListByProfile<P extends FeatureProfile> = P extends 'list'
  ? FeatureListProfile
  : P extends 'card'
    ? FeatureCardProfile
    : P extends 'detail'
      ? FeatureDetailProfile
      : FeatureAdminProfile

export type FeatureGetParamsByProfile<P extends FeatureProfile> = Omit<
  FeatureGetParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type FeatureListParamsByProfile<P extends FeatureProfile> = Omit<
  FeatureListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type FeatureDB = z.infer<typeof FeatureBase>
export type FeatureDBNew = z.infer<typeof FeatureInsert>
export type FeatureDBPartial = z.infer<typeof FeatureUpdate>
export type FeatureDBRaw = z.infer<typeof FeatureAdminRow>
export type FeatureFromCollection = z.infer<typeof FeatureListProfileAPI>
export type Feature = z.infer<typeof FeatureAdminProfileAPI>
export type FeatureNew = z.infer<typeof FeatureEntityFormData>
export type FeaturePartial = Partial<FeatureNew>

export type FeatureListDBRaw = z.infer<typeof FeatureListRow>
export type FeatureCardDBRaw = z.infer<typeof FeatureCardRow>
export type FeatureAdminDBRaw = z.infer<typeof FeatureAdminRow>
export type FeatureQueryRowByProfile<P extends FeatureProfile> = P extends 'admin'
  ? FeatureAdminDBRaw
  : P extends 'card' | 'detail'
    ? FeatureCardDBRaw
    : FeatureListDBRaw

export type FeatureFormInput = z.input<typeof FeatureFormData>
export type FeatureBooleanField = 'isPublished' | 'isArchived'
export type FeatureSubmitMode = ResourceSubmitMode
export type FeatureGetResponse = EntityResponse<FeatureAdminProfile>
export type FeatureGetState = FeatureGetResponse | null
export type FeaturePublishInput = z.input<typeof PublishFeatureSchema>
export type FeatureArchiveInput = z.input<typeof RemoveFeatureSchema>
export type FeaturePreflightInput = z.input<typeof FeaturePreflightFormData>

export type FeatureProbe = {
  id: string
  organisationId: string
  projectId: string
  layerId: string
  resourceHubId: string | null
  isPublished: boolean
  isArchived: boolean
}

export type FeatureUpdateProbe = FeatureProbe & {
  contributorId: string | null
  geometry: unknown
  addressMeta: unknown
  isIntangible: boolean
  isVisitable: boolean
  modifiedAt: string
}

export type FeatureCommandProbe = {
  id: string
  organisationId: string
  projectId: string
  layerId: string
  resourceHubId: string | null
}

export type FeatureI18nDB = z.infer<typeof FeatureI18nBase>
export type FeatureI18nNew = z.infer<typeof FeatureI18nInsert>
export type FeatureI18nPartial = z.infer<typeof FeatureI18nUpdate>
export type FeaturePropertyDB = z.infer<typeof FeaturePropertyBase>
export type FeaturePropertyNew = z.infer<typeof FeaturePropertyInsert>
export type FeaturePropertyPartial = z.infer<typeof FeaturePropertyUpdate>
export type FeaturePropertyMerge = z.infer<typeof FeaturePropertyCollectionAPI> & {
  id?: string
}
export type FeatureProperty = z.infer<typeof FeaturePropertyAPI>
export type NewFeatureProperty = z.infer<typeof FeaturePropertyFormData>
export type PartialFeatureProperty = Partial<NewFeatureProperty>
export type FeaturePropertyI18nDB = z.infer<typeof FeaturePropertyI18nBase>
export type FeaturePropertyI18nNew = z.infer<typeof FeaturePropertyI18nInsert>
export type FeaturePropertyI18nPartial = z.infer<typeof FeaturePropertyI18nUpdate>
export type UserFeatureDB = z.infer<typeof UserFeatureBase>
export type UserFeatureNew = z.infer<typeof UserFeatureInsert>
export type UserFeaturePartial = z.infer<typeof UserFeatureUpdate>
export type FeatureExtended = FeatureFromCollection & {
  hierarchy: {
    organisation: string | null
    project: string | null
    layer: string | null
    feature: string | null
  }
}

export type NewFeatureWithLocationAndParents = PartialExcept<
  NewFeatureTask & {
    feature: PartialExcept<
      UserContributedFeature,
      'layerId' | 'geometry' | 'properties'
    > & {
      geometry: Geometry
      properties: UserContributedFeatureProperty[]
    }
  },
  'organisationId' | 'projectId' | 'layerId'
>

export type UserContributedFeatureProperty = {
  property: Property
  propertyId: Id
  propertyValueId?: Id
  value?: string
  i18n?: Partial<Record<Locale, { locale: Locale; value: string; valueGen: boolean }>>
}

export type UserContributedFeature = {
  organisationId: Id
  projectId: Id
  layerId: Id
  geometry: Geometry
  isDraft?: boolean
  i18n: Partial<
    Record<
      LocaleKey,
      {
        title?: string
        description?: string
        displayAddress: string
        displayAddressGen: boolean
      }
    >
  >
  properties: UserContributedFeatureProperty[]
  contributorId?: Id
}

export type FeatureChangedRelationResolution<TEffective> =
  ChangedRelationResolution<TEffective>
export type FeatureResolveChangedRelationParams<TEffective> =
  ResolveChangedRelationParams<TEffective>
export type FeatureApplyChangedRelationFieldParams<
  TData extends Record<string, unknown>,
  TKey extends keyof TData,
  TEffective,
> = ApplyChangedRelationFieldParams<TData, TKey, TEffective>
