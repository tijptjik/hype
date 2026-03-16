import type { z } from 'zod'
import type { EntityResponse, FormLocaleInput, LayerMetadata } from '$lib/types'
import type { GetQueryParams, ListQueryParams } from '$lib/db/zod/schema/api.types'
import type {
  LayerAdminProfileAPI,
  LayerCardProfileAPI,
  LayerDetailProfileAPI,
  LayerEntityFormData,
  LayerFormData,
  LayerI18nRecord,
  LayerI18nRecordCreate,
  LayerI18nRecordUpdate,
  LayerListProfileAPI,
  LayerPreflightFormData,
  LayerProfile as LayerProfileSchema,
  LayerPropertyAdminProfileAPI,
  LayerPropertyListProfileAPI,
  LayerPropertyRecord,
  LayerPropertyRecordCreate,
  LayerPropertyRecordUpdate,
  LayerRaw,
  LayerRecord,
  LayerRecordCreate,
  LayerRecordUpdate,
  PublishLayerSchema,
  RemoveLayerSchema,
  UserLayerRecord,
  UserLayerRecordCreate,
} from '$lib/db/zod/schema/layer'

export type LayerListParams = ListQueryParams
export type LayerGetParams = GetQueryParams
export type LayerProfile = z.infer<typeof LayerProfileSchema>
export type LayerListProfile = z.infer<typeof LayerListProfileAPI>
export type LayerCardProfile = z.infer<typeof LayerCardProfileAPI>
export type LayerDetailProfile = z.infer<typeof LayerDetailProfileAPI>
export type LayerAdminProfile = z.infer<typeof LayerAdminProfileAPI>

export type LayerEntityByProfile<P extends LayerProfile> = P extends 'list'
  ? LayerListProfile
  : P extends 'card'
    ? LayerCardProfile
    : P extends 'detail'
      ? LayerDetailProfile
      : LayerAdminProfile

export type LayerListByProfile<P extends LayerProfile> = P extends 'list'
  ? LayerListProfile
  : P extends 'card'
    ? LayerCardProfile
    : P extends 'detail'
      ? LayerDetailProfile
      : LayerAdminProfile

export type LayerGetParamsByProfile<P extends LayerProfile> = Omit<
  LayerGetParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type LayerListParamsByProfile<P extends LayerProfile> = Omit<
  LayerListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type LayerDB = z.infer<typeof LayerRecord>
export type LayerDBNew = z.infer<typeof LayerRecordCreate>
export type LayerDBPartial = z.infer<typeof LayerRecordUpdate>
export type LayerDBRaw = z.infer<typeof LayerRaw>
export type Layer = z.infer<typeof LayerAdminProfileAPI>
export type LayerNew = z.infer<typeof LayerEntityFormData>
export type LayerPartial = Partial<LayerNew>

export type LayerFormInput = z.input<typeof LayerFormData>
export type LayerFormLocaleInput = FormLocaleInput<LayerFormInput>
export type LayerSubmitData = Partial<LayerFormInput['data']>
export type LayerBooleanField = 'isPublished' | 'isArchived'
export type LayerSubmitUpdatesParams<TEntityResult, TListResult> = {
  layerId?: string | null
  entityQuery: TEntityResult
  listQuery: TListResult
}
export type LayerGetResponse = EntityResponse<LayerAdminProfile>
export type LayerGetState = LayerGetResponse | null
export type LayerPublishInput = z.input<typeof PublishLayerSchema>
export type LayerArchiveInput = z.input<typeof RemoveLayerSchema>
export type LayerPreflightInput = z.input<typeof LayerPreflightFormData>

export type LayerProbe = {
  id: string
  organisationId: string
  projectId: string
  hubId: string | null
  isPublished: boolean
  isArchived: boolean
}

export type LayerUpdateProbe = {
  id: string
  code: string
  organisationId: string
  projectId: string
  hubId: string | null
  metadata: LayerMetadata | null
  modifiedAt: string
}

export type LayerCommandProbe = {
  id: string
  organisationId: string
  projectId: string
  hubId: string | null
}

export type LayerI18nDB = z.infer<typeof LayerI18nRecord>
export type LayerI18nNew = z.infer<typeof LayerI18nRecordCreate>
export type LayerI18nPartial = z.infer<typeof LayerI18nRecordUpdate>
export type LayerPropertyDB = z.infer<typeof LayerPropertyRecord>
export type LayerPropertyDBRaw = z.infer<typeof LayerPropertyAdminProfileAPI>
export type LayerPropertyNew = z.infer<typeof LayerPropertyRecordCreate>
export type LayerPropertyPartial = z.infer<typeof LayerPropertyRecordUpdate>
export type LayerPropertyListProfile = z.infer<typeof LayerPropertyListProfileAPI>
export type LayerPropertyAdminProfile = z.infer<typeof LayerPropertyAdminProfileAPI>
export type LayerPropertyPartialExtra = LayerPropertyAdminProfile
export type UserLayerDB = z.infer<typeof UserLayerRecord>
export type UserLayerNew = z.infer<typeof UserLayerRecordCreate>
