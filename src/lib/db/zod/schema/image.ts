// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { image, featureImage } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { FeatureBase } from './feature'
import {
  ImageCDN,
  ImageContextResource,
  ImageContextResourceExtended,
  ImageIntent,
} from '$lib/enums'
import { UserBase } from './user'

/* ----------------- */
// IMAGE CORE SCHEMAS
/* -------- */

export const EXIFBasic = z.object({
  Copyright: z.string().nullish(),
  CopyrightNotice: z.string().nullish(),
  Credit: z.string().nullish(),
  DateTimeOriginal: z.string().nullish(),
  CreateDate: z.string().nullish(),
  ModifyDate: z.string().nullish(),
  GPSLatitude: z.string().nullish(),
  GPSLongitude: z.string().nullish(),
  'By-line': z.string().nullish(),
  Keywords: z.string().nullish(),
  ImageWidth: z.string().nullish(),
  ImageHeight: z.string().nullish(),
  Make: z.string().nullish(),
  Model: z.string().nullish(),
  LensModel: z.string().nullish(),
  LensInfo: z.string().nullish(),
  RawFileName: z.string().nullish(),
})

export const ImageBase = createSelectSchema(image).extend({
  metadata: EXIFBasic.nullish(),
})
export const ImageBasic = ImageBase.pick({
  id: true,
  cdn: true,
  env: true,
  cdnId: true,
  publicId: true,
  version: true,
  presentationMode: true,
  metadata: true,
})
export const ImageInsert = createInsertSchema(image).extend({
  id: z.string().optional(),
  publicId: z.string().min(1, 'Public ID is required'),
  cdn: z
    .enum(Object.values(ImageCDN) as [string, ...string[]])
    .prefault(ImageCDN.cloudinary as string),
  contributorId: z.string(),
  capturedAt: z.string(),
})
export const ImageUpdate = createUpdateSchema(image)

/* ----------------- */
// IMAGE RELATIONAL SCHEMAS : FEATURE
/* -------- */

export const FeatureImageBase = createSelectSchema(featureImage)
export const FeatureImageInsert = createInsertSchema(featureImage).extend({
  featureId: z.string(),
  intent: z
    .enum(Object.values(ImageIntent) as [string, ...string[]])
    .prefault(ImageIntent.undefined),
  isPublished: z.boolean().prefault(false),
  publishedAt: z.string().optional(),
})

export const FeatureImageUpdate = createUpdateSchema(featureImage)

/* ----------------- */
// IMAGE API SCHEMAS
/* -------- */

export const FeatureImageAPI = FeatureImageBase.extend({
  feature: z.lazy(() => FeatureBase),
  image: ImageBase,
})

export const ImageAPI = ImageBase.extend({
  altText: z.string().nullish(),
  featureId: z.string().optional(),
  attribution: z.string().nullish(),
  intent: z
    .enum(Object.values(ImageIntent) as [string, ...string[]])
    .prefault(ImageIntent.undefined)
    .optional(),
  isPublished: z.boolean().prefault(false).optional(),
  publishedAt: z.string().optional(),
  preview: z.string().optional(),
  // Feature context fields
  organisationId: z.string().nullish(),
  projectId: z.string().nullish(),
  layerId: z.string().nullish(),
})

const ImageListFields = ImageBase.pick({
  id: true,
  cdn: true,
  env: true,
  cdnId: true,
  publicId: true,
  version: true,
  presentationMode: true,
  capturedAt: true,
  contributorId: true,
  createdAt: true,
  modifiedAt: true,
})

export const ImageInsertAPI = ImageInsert.extend({
  featureImage: FeatureImageInsert.omit({ imageId: true }).optional(),
  ctxType: z.enum(Object.values(ImageContextResource) as [string, ...string[]]),
  ctxId: z.string(),
})

export const ImageInsertWithFeatureAPI = ImageInsert.extend({
  featureImage: FeatureImageInsert.omit({ imageId: true }),
  ctxType: z.enum([ImageContextResource.feature]),
  ctxId: z.string(),
})

export const ImageInsertWithProjectOrOrganisationAPI = ImageInsert.extend({
  ctxType: z.enum([ImageContextResource.project, ImageContextResource.organisation]),
  ctxId: z.string(),
})

export const ImageUpdateAPI = ImageUpdate.extend({
  featureImage: FeatureImageUpdate.optional(),
  ctxType: z.enum(Object.values(ImageContextResource) as [string, ...string[]]),
  refId: z.string(),
})

export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
  feature: z.lazy(() => FeatureBase),
  image: ImageBase,
})

export const ImageContextEnvelopeAPI = z.object({
  ctxType: z.string(), // ImageContextType
  ctxId: z.string(), // Id
  // New envelope contract: profile-based image payloads only.
  image: z.lazy(() => z.union([ImageListProfileAPI, ImageAdminProfileAPI])),
  intent: z.enum(Object.values(ImageIntent) as [string, ...string[]]).nullish(),
  isPublished: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
})

/* ----------------- */
// INTERMEDIATE
/* -------- */

export const ImageFlat = ImageBase.extend({
  featureId: z.string().nullish(),
  attribution: z.string().nullish(),
  intent: z.enum(Object.values(ImageIntent) as [string, ...string[]]).nullish(),
  isPublished: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
})

export const ImageFlatUpdate = ImageUpdate.extend({
  featureId: z.string(),
  imageId: z.string(),
  attribution: z.string().nullish(),
  intent: z.enum(Object.values(ImageIntent) as [string, ...string[]]).nullish(),
  isPublished: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
})

export const ImageBaseRaw = ImageBase.extend({
  featureImage: FeatureImageBase,
  contributor: UserBase,
})

/* ----------------- */
// SVELTE REMOTE FUNCTION REFACTOR
/* -------- */

export const ImageRequestMetaSchema = z
  .object({
    isAdminRequest: z.boolean().optional(),
    profile: z.enum(['list', 'card', 'detail', 'admin']).optional(),
  })
  .optional()

export const ImageProfile = z.enum(['list', 'card', 'detail', 'admin'])

export const ImageListProfileAPI = ImageListFields
// Alias for compatibility with organisation profile semantics.
export const ImageDetailProfileAPI = ImageListProfileAPI
const ImageAdminFields = ImageBase.pick({
  originalFilename: true,
  originalExtension: true,
  originalWidth: true,
  originalHeight: true,
  cameraModel: true,
  credit: true,
  latitude: true,
  longitude: true,
})
export const ImageAdminProfileAPI = ImageDetailProfileAPI.extend({
  ...ImageAdminFields.shape,
})

export const ImageContextTypeExtendedSchema = z.enum([
  ...Object.values(ImageContextResource),
  ...Object.values(ImageContextResourceExtended),
] as [string, ...string[]])

export const ImageContextNarrowingTypeSchema = z.enum(
  Object.values(ImageContextResourceExtended) as [string, ...string[]],
)

export const ImagesByContextSchema = z.object({
  ctxType: ImageContextTypeExtendedSchema,
  ctxId: z.string().min(1),
  // Optional secondary narrowing (for example task-scoped images within a feature context).
  ctxNarrowingType: ImageContextNarrowingTypeSchema.optional(),
  ctxNarrowingId: z.string().min(1).optional(),
  pagination: z
    .object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    })
    .optional(),
  sorting: z
    .object({
      sortBy: z.string().trim().min(1).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
  meta: ImageRequestMetaSchema,
})

export const ImagesByIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  meta: ImageRequestMetaSchema,
})

export const ImageByIdSchema = z.object({
  id: z.string().min(1),
  meta: ImageRequestMetaSchema,
})

export const UpdateImageSchema = z.object({
  id: z.string().min(1),
  ctxType: ImageContextTypeExtendedSchema,
  ctxId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  meta: ImageRequestMetaSchema,
})

export const SetImageIntentSchema = z.object({
  id: z.string().min(1),
  ctxType: ImageContextTypeExtendedSchema,
  ctxId: z.string().min(1),
  intent: z.string().min(1),
  featureId: z.string().optional(),
  isPublished: z.boolean().optional(),
  meta: ImageRequestMetaSchema,
})

export const SetImagePublishedSchema = z.object({
  id: z.string().min(1),
  ctxType: ImageContextTypeExtendedSchema,
  ctxId: z.string().min(1),
  featureId: z.string().optional(),
  isPublished: z.boolean(),
  meta: ImageRequestMetaSchema,
})

export const DeleteImageSchema = z.object({
  id: z.string().min(1),
  ctxType: ImageContextTypeExtendedSchema,
  ctxId: z.string().min(1),
  meta: ImageRequestMetaSchema,
})

export const CloudinarySignatureSchema = z.object({
  paramsToSign: z.object({
    folder: z.string().optional(),
    public_id: z.string().nullish(),
    media_metadata: z.literal('true').optional(),
  }),
  meta: ImageRequestMetaSchema,
})
