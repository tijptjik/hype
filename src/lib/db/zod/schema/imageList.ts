// ZOD
import { z } from 'zod'
// ENUMS
import { ImageCDN, ImageEnv, ImagePresentationMode } from '#lib/enums.js'

export const ImageListFields = z
  .object({
    id: z.string(),
    cdn: z.enum(Object.values(ImageCDN) as [string, ...string[]]),
    env: z.enum(Object.values(ImageEnv) as [string, ...string[]]),
    cdnId: z.string().nullable(),
    publicId: z.string(),
    contentHash: z.string().nullable(),
    version: z
      .int()
      .gte(Number.MIN_SAFE_INTEGER)
      .lte(Number.MAX_SAFE_INTEGER)
      .nullable(),
    presentationMode: z.enum(
      Object.values(ImagePresentationMode) as [string, ...string[]],
    ),
    contributorId: z.string().nullable(),
    createdAt: z.string(),
    modifiedAt: z.string(),
  })
  .extend({
    imageRevisionId: z.string().optional(),
    galleryPosition: z.number().int().nonnegative().optional(),
    gallerySortMode: z.enum(['automatic', 'manual']).optional(),
    galleryIntentOrder: z.array(z.string()).optional(),
    galleryCaption: z.record(z.string(), z.string()).optional(),
    galleryAlt: z.record(z.string(), z.string()).optional(),
  })
