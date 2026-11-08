import type { z } from 'zod'
import type { EntityResponse, Id } from '#lib/types.js'
import type {
  ImageCDN,
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
} from '#lib/enums.js'
import type { HubDB } from '#lib/db/zod/schema/hub.types.js'
import type { OrganisationDB } from '#lib/db/zod/schema/organisation.types.js'
import type { ProjectDB } from '#lib/db/zod/schema/project.types.js'
import type {
  FeatureImageBase,
  ImageAdminProfileAPI,
  ImageAPI,
  ImageBase,
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
  ImageProfile as ImageProfileSchema,
  FinalizeImageUploadLinkSchema,
  ImageListProfileAPI,
  ImageUpdate,
  GetImageMetadataSchema,
  FinalizeImageUploadSchema,
} from '#lib/db/zod/schema/image.js'

export type ImageDB = z.infer<typeof ImageBase>
export type ImageDBBasic = z.infer<typeof ImageBasic>
export type ImageDBNew = z.infer<typeof ImageInsert>
export type ImageDBPartial = z.infer<typeof ImageUpdate>
export type ImageDBFlat = z.infer<typeof ImageFlat>
export type ImageDBFlatUpdate = z.infer<typeof ImageFlatUpdate>

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

export type Intent = string

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
  intentLabel?: string
  revisionDraft?: { proposalId: string; candidateRevisionId: string }
  image: Image &
    Pick<
      z.infer<typeof ImageListProfileAPI>,
      | 'imageRevisionId'
      | 'galleryPosition'
      | 'gallerySortMode'
      | 'galleryIntentOrder'
      | 'galleryCaption'
      | 'galleryAlt'
    > & {
      preview?: string
      file?: File
    }
}

export type FeatureImageDB = z.infer<typeof FeatureImageBase>

export type FeatureImage = z.infer<typeof FeatureImageBase>

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

export type Metadata = Record<string, string>
export type FinalizeImageUploadLink = z.infer<typeof FinalizeImageUploadLinkSchema>
export type FinalizeImageUploadParams = z.infer<typeof FinalizeImageUploadSchema>
export type GetImageMetadataParams = z.infer<typeof GetImageMetadataSchema>
export type ImageUploadSession = {
  cdn: `${ImageCDN}`
  env: `${ImageEnv}`
  publicId: string
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  confirmToken: string
  expiresAt: string
  replaceImageId?: string
}

export type LoadStatus = 'initial' | 'uploaded' | 'loading' | 'loaded' | 'error'
export type UploadStatus =
  | 'idle'
  | 'staged'
  | 'uploading'
  | 'finalizing'
  | 'uploaded'
  | 'error'
  | 'invalidated'

export type ImageUpload = {
  file: File
  status: UploadStatus
  retries: number
  queuedAt: number
  optimisticKey: string
  imageToReplace?: ImageCtxEnvelope
  preview?: string
  savedImage?: ImageCtxEnvelope
  errorMessage?: string | null
}

export type UploadedPhoto = {
  file: File
  previewUrl: string
}

export type ImageUploadCtx = {
  attachment?: 'immediate' | 'deferred'
  ctxType: ImageContextResource | ImageContextResourceExtended
  ctxId: Id
  hub?: HubDB
  organisation?: OrganisationDB
  project?: ProjectDB
  imageToReplace?: ImageCtxEnvelope
  isAdminRequest?: boolean
  links?: FinalizeImageUploadLink[]
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

export type ImageMetadataResponse = EntityResponse<
  ImageMetadataBasic | ImageMetadataFull | null
>
