import type { z } from 'zod'
import type { EntityResponse, Id } from '$lib/types'
import type {
  ImageCDN,
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
} from '$lib/enums'
import type { HubDB } from '$lib/db/zod/schema/hub.types'
import type { OrganisationDB } from '$lib/db/zod/schema/organisation.types'
import type { ProjectDB } from '$lib/db/zod/schema/project.types'
import type {
  FeatureImageBase,
  FeatureImageInsert,
  FeatureImageUpdate,
  ImageAdminProfileAPI,
  ImageAPI,
  ImageBase,
  ImageBaseRaw,
  ImageBasic,
  ImageDetailProfileAPI,
  ImageFlat,
  ImageFlatUpdate,
  ImageMetadataBasicSchema,
  ImageMetadataFullSchema,
  ImageMetadataProfileSchema,
  ImageInsert,
  ImageInsertAPI,
  ImageInsertWithFeatureAPI,
  ImageInsertWithProjectOrOrganisationAPI,
  ImageProfile as ImageProfileSchema,
  ImageListProfileAPI,
  ImageUpdate,
  ImageUpdateAPI,
  GetImageMetadataSchema,
  AuthImageUploadSchema,
  FinalizeImageUploadSchema,
} from '$lib/db/zod/schema/image'

export type ImageDB = z.infer<typeof ImageBase>
export type ImageDBBasic = z.infer<typeof ImageBasic>
export type ImageDBNew = z.infer<typeof ImageInsert>
export type ImageDBPartial = z.infer<typeof ImageUpdate>
export type ImageDBFlat = z.infer<typeof ImageFlat>
export type ImageDBFlatUpdate = z.infer<typeof ImageFlatUpdate>
export type ImageDBRaw = z.infer<typeof ImageBaseRaw>

export type Image = z.infer<typeof ImageAPI>
export type ImageListProfile = z.infer<typeof ImageListProfileAPI>
export type ImageDetailProfile = z.infer<typeof ImageDetailProfileAPI>
export type ImageAdminProfile = z.infer<typeof ImageAdminProfileAPI>
export type ImageProfile = z.infer<typeof ImageProfileSchema>
export type ImageMetadataBasic = z.infer<typeof ImageMetadataBasicSchema>
export type ImageMetadataFull = z.infer<typeof ImageMetadataFullSchema>
export type ImageMetadataProfile = z.infer<typeof ImageMetadataProfileSchema>
export type ImageNew = z.infer<typeof ImageInsertAPI>
export type ImageNewWithFeature = z.infer<typeof ImageInsertWithFeatureAPI>
export type ImageNewWithProjectOrOrganisation = z.infer<
  typeof ImageInsertWithProjectOrOrganisationAPI
>
export type ImagePartial = z.infer<typeof ImageUpdateAPI>
export type ImageUpdateData = Omit<ImagePartial, 'ctxType' | 'refId'>
export type ImageEntityByProfile<P extends ImageProfile> = P extends 'list'
  ? ImageListProfile
  : P extends 'card'
    ? ImageListProfile
    : P extends 'detail'
      ? ImageDetailProfile
      : ImageAdminProfile
export type ImageListByProfile<P extends ImageProfile> = P extends 'list'
  ? ImageListProfile
  : P extends 'card'
    ? ImageListProfile
    : P extends 'detail'
      ? ImageDetailProfile
      : ImageAdminProfile

export type Intent =
  | 'canonical'
  | 'closeUp'
  | 'context'
  | 'general'
  | 'research'
  | 'undefined'

export type ImageContextType = ImageContextResource | ImageContextResourceExtended

export type ImageContextEnvelope<P extends ImageProfile = 'list'> = {
  ctxType: ImageContextType
  ctxId: Id
  image: ImageListByProfile<P>
  intent?: Intent | null
  isPublished?: boolean | null
  publishedAt?: string | null
}

export type ImageCtxEnvelope = Omit<ImageContextEnvelope<'detail'>, 'image'> & {
  image: Image & {
    preview?: string
    file?: File
  }
}

export type FeatureImageDB = z.infer<typeof FeatureImageBase>
export type FeatureImageDBNew = z.infer<typeof FeatureImageInsert>
export type FeatureImageDBPartial = z.infer<typeof FeatureImageUpdate>

export type FeatureImage = z.infer<typeof FeatureImageBase>
export type FeatureImageNew = z.infer<typeof FeatureImageInsert>
export type FeatureImagePartial = z.infer<typeof FeatureImageUpdate>

export type EXIF = {
  CopyrightNotice: string
  Copyright: string
  Credit: string
  DateTimeOriginal: string
  CreateDate: string
  ModifyDate: string
  GPSLatitude: string
  GPSLongitude: string
  'By-line': string
  [key: string]: string
}

export type LngLat = {
  latitude?: string
  longitude?: string
}

export type Metadata = Record<string, string>
export type AuthImageUploadParams = z.infer<typeof AuthImageUploadSchema>
export type FinalizeImageUploadParams = z.infer<typeof FinalizeImageUploadSchema>
export type GetImageMetadataParams = z.infer<typeof GetImageMetadataSchema>
export type ImageUploadSession = {
  cdn: `${ImageCDN}`
  env: `${ImageEnv}`
  publicId: string
  version: number
  uploadUrl: string
  method: 'POST'
  headers: Record<string, string>
  replaceImageId?: string
}

export type LoadStatus = 'initial' | 'uploaded' | 'loading' | 'loaded' | 'error'
export type UploadStatus =
  | 'idle'
  | 'staged'
  | 'uploading'
  | 'uploaded'
  | 'error'
  | 'invalidated'

export type ImageUpload = {
  file: File
  status: UploadStatus
  retries: number
  imageToReplace?: ImageCtxEnvelope
  preview?: string
}

export type UploadedPhoto = {
  file: File
  previewUrl: string
}

export type ImageUploadCtx = {
  ctxType: ImageContextResource
  ctxId: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  imageToReplace?: ImageCtxEnvelope
}

export type ImageEditCtx = {
  ctxType: ImageContextResource
  ctxId: Id
}

export type ImageRemoteMeta = {
  isAdminRequest?: boolean
  profile?: ImageProfile
}

export type ImagesForContextParams = {
  ctxType: ImageContextType
  ctxId: Id
  ctxNarrowingType?: ImageContextResourceExtended
  ctxNarrowingId?: Id
  pagination?: {
    limit?: number
    offset?: number
  }
  sorting?: {
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }
  meta?: ImageRemoteMeta
}

export type ImagesForContextParamsByProfile<P extends ImageProfile> = Omit<
  ImagesForContextParams,
  'meta'
> & {
  meta?: ImageRemoteMeta & { profile?: P }
}

export type ImagesForIdsParams = {
  ids: Id[]
  meta?: ImageRemoteMeta
}

export type ImagesForIdsParamsByProfile<P extends ImageProfile> = Omit<
  ImagesForIdsParams,
  'meta'
> & {
  meta?: ImageRemoteMeta & { profile?: P }
}

export type ImageByIdParams = {
  id: Id
  meta?: ImageRemoteMeta
}

export type ImageByIdParamsByProfile<P extends ImageProfile> = Omit<
  ImageByIdParams,
  'meta'
> & {
  meta?: ImageRemoteMeta & { profile?: P }
}

export type CreateImageParams = {
  data: ImageNew
  meta?: ImageRemoteMeta
}

export type UpdateImageParams = {
  id: Id
  ctxType: ImageContextType
  ctxId: Id
  data: Record<string, unknown>
  meta?: ImageRemoteMeta
}

export type SetImageIntentParams = {
  id: Id
  ctxType: ImageContextType
  ctxId: Id
  intent: Intent
  featureId?: Id
  isPublished?: boolean
  meta?: ImageRemoteMeta
}

export type SetImagePublishedParams = {
  id: Id
  ctxType: ImageContextType
  ctxId: Id
  featureId?: Id
  isPublished: boolean
  meta?: ImageRemoteMeta
}

export type DeleteImageParams = {
  id: Id
  ctxType: ImageContextType
  ctxId: Id
  meta?: ImageRemoteMeta
}

export type ImageCollectionResponse<P extends ImageProfile = 'list'> = EntityResponse<
  Array<ImageContextEnvelope<P>>
> & {
  profile: P
}

export type ImageByIdResponse<P extends ImageProfile = 'detail'> =
  EntityResponse<ImageContextEnvelope<P> | null> & {
    profile: P
  }

export type ImageMetadataResponse = EntityResponse<
  ImageMetadataBasic | ImageMetadataFull | null
>
