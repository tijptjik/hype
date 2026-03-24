// ZOD
import { z } from 'zod'
// DRIZZLE
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
// DRIZZLE SCHEMA
import { feature, featureImage, image } from '$lib/db/schema/index'
import {
  ImageCDN,
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
  ImageIntent,
} from '$lib/enums'
import { UserBase } from './user'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DB / RELATIONAL PRIMITIVES
//    - ImageBase
//    - ImageBasic
//    - ImageInsert
//    - ImageUpdate
//    - FeatureImageBase
//    - FeatureImageInsert
//    - FeatureImageUpdate
//
// 2. REMOTE PROFILE SCHEMAS
//    - ImageProfile
//    - ImageListProfileAPI
//    - ImageCardProfileAPI
//    - ImageDetailProfileAPI
//    - ImageAdminProfileAPI
//    - ImageContextEnvelopeAPI
//
// 3. REMOTE MUTATION SCHEMAS
//    - FeatureImageAPI
//    - ImageAPI
//    - ImageInsertAPI
//    - ImageInsertWithFeatureAPI
//    - ImageInsertWithProjectOrOrganisationAPI
//    - ImageInsertWithHubAPI
//    - ImageUpdateAPI
//    - FeatureImageUpdateAPI
//
// 4. METADATA SCHEMAS
//    - ImageMetadataBasicSchema
//    - ImageMetadataFullSchema
//    - ImageMetadataProfileSchema
//    - GetImageMetadataSchema
//
// 5. INTERMEDIATE SCHEMAS
//    - ImageFlat
//    - ImageFlatUpdate
//    - ImageBaseRaw
//
// 6. REMOTE FUNCTION SCHEMAS
//    - ImageRequestMetaSchema
//    - ImagesByContextSchema
//    - ImagesByIdsSchema
//    - ImageByIdSchema
//    - UpdateImageSchema
//    - SetImageIntentSchema
//    - SetImagePublishedSchema
//    - DeleteImageSchema
//    - AuthImageUploadSchema
//    - FinalizeImageUploadSchema

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const ImageBase = createSelectSchema(image)
export const ImageBasic = ImageBase.pick({
  id: true,
  cdn: true,
  env: true,
  cdnId: true,
  publicId: true,
  version: true,
  presentationMode: true,
})
export const ImageInsert = createInsertSchema(image).extend({
  id: z.string().optional(),
  publicId: z.string().min(1, 'Public ID is required'),
  cdn: z
    .enum(Object.values(ImageCDN) as [string, ...string[]])
    .prefault(ImageCDN.cloudflareR2 as string),
  env: z
    .enum(Object.values(ImageEnv) as [string, ...string[]])
    .prefault(ImageEnv.local as string),
  contributorId: z.string(),
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

// ═══════════════════════
// 2. REMOTE PROFILE SCHEMAS
// ═══════════════════════

const ImageListFields = ImageBase.pick({
  id: true,
  cdn: true,
  env: true,
  cdnId: true,
  publicId: true,
  version: true,
  presentationMode: true,
  contributorId: true,
  createdAt: true,
  modifiedAt: true,
})

export const ImageProfile = z.enum(['list', 'card', 'detail', 'admin'])

export const ImageListProfileAPI = ImageListFields
export const ImageCardProfileAPI = ImageListProfileAPI
export const ImageDetailProfileAPI = ImageCardProfileAPI
export const ImageAdminProfileAPI = ImageDetailProfileAPI

export const ImageContextEnvelopeAPI = z.object({
  ctxType: z.string(),
  ctxId: z.string(),
  image: z.lazy(() => z.union([ImageListProfileAPI, ImageAdminProfileAPI])),
  intent: z.enum(Object.values(ImageIntent) as [string, ...string[]]).nullish(),
  isPublished: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
})

// ═══════════════════════
// 3. REMOTE MUTATION SCHEMAS
// ═══════════════════════

export const FeatureImageAPI = FeatureImageBase.extend({
  feature: z.lazy(() => createSelectSchema(feature)),
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
  organisationId: z.string().nullish(),
  projectId: z.string().nullish(),
  layerId: z.string().nullish(),
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

export const ImageInsertWithHubAPI = ImageInsert.extend({
  ctxType: z.enum([ImageContextResource.hub]),
  ctxId: z.string(),
})

export const ImageUpdateAPI = ImageUpdate.extend({
  featureImage: FeatureImageUpdate.optional(),
  ctxType: z.enum(Object.values(ImageContextResource) as [string, ...string[]]),
  refId: z.string(),
})

export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
  feature: z.lazy(() => createSelectSchema(feature)),
  image: ImageBase,
})

// ═══════════════════════
// 4. METADATA SCHEMAS
// ═══════════════════════

export const ImageMetadataBasicSchema = z.object({
  originalFilename: z.string().nullish(),
  originalExtension: z.string().nullish(),
  originalWidth: z.number().int().nullish(),
  originalHeight: z.number().int().nullish(),
  cameraModel: z.string().nullish(),
  capturedAt: z.string().nullish(),
  credit: z.string().nullish(),
  latitude: z.string().nullish(),
  longitude: z.string().nullish(),
})

export const ImageMetadataFullSchema = ImageMetadataBasicSchema.extend({
  metadata: z.record(z.string(), z.string()).nullish(),
  sourceVersion: z.number().int().nullish(),
  uploadedAt: z.string().nullish(),
  modifiedAt: z.string().nullish(),
})

export const ImageMetadataProfileSchema = z.enum(['basic', 'full', 'auto', 'admin'])

// ═══════════════════════
// 5. INTERMEDIATE SCHEMAS
// ═══════════════════════

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

// ═══════════════════════
// 6. REMOTE FUNCTION SCHEMAS
// ═══════════════════════

export const ImageRequestMetaSchema = z
  .object({
    isAdminRequest: z.boolean().optional(),
    profile: z.enum(['list', 'card', 'detail', 'admin']).optional(),
  })
  .optional()

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

export const GetImageMetadataSchema = z.object({
  publicId: z.string().min(1),
  profile: ImageMetadataProfileSchema.default('basic'),
  version: z.number().int().positive().optional(),
  env: z.enum(Object.values(ImageEnv) as [string, ...string[]]).optional(),
  meta: ImageRequestMetaSchema,
})

export const AuthImageUploadSchema = z.object({
  cdn: z.enum(Object.values(ImageCDN) as [string, ...string[]]),
  env: z.enum(Object.values(ImageEnv) as [string, ...string[]]),
  ctxType: z.enum(Object.values(ImageContextResource) as [string, ...string[]]),
  ctxId: z.string().min(1),
  organisationId: z.string().optional(),
  projectId: z.string().optional(),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  replaceImageId: z.string().optional(),
  meta: ImageRequestMetaSchema,
})

export const FinalizeImageUploadSchema = z.object({
  publicId: z.string().min(1),
  env: z.enum(Object.values(ImageEnv) as [string, ...string[]]),
  ctxType: z.enum(Object.values(ImageContextResource) as [string, ...string[]]),
  ctxId: z.string().min(1),
  contributorId: z.string().optional(),
  replaceImageId: z.string().optional(),
  featureImage: FeatureImageInsert.omit({ imageId: true }).optional(),
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
