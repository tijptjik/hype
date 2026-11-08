// ZOD
import { z } from 'zod'
// IMAGE CONTRACTS
import { ImageIntentIdSchema } from '#lib/images/intents.js'
import { ImageContextResource, ImageContextResourceExtended } from '#lib/enums.js'
import { ImageListFields } from './imageList'

export const ImageProfile = z.enum(['list', 'card', 'detail', 'admin'])

export const ImageListProfileAPI = ImageListFields
export const ImageCardProfileAPI = ImageListProfileAPI
export const ImageDetailProfileAPI = ImageCardProfileAPI
export const ImageAdminProfileAPI = ImageDetailProfileAPI

export const ImageContextEnvelopeAPI = z.object({
  ctxType: z.union([
    z.enum(ImageContextResource),
    z.enum(ImageContextResourceExtended),
  ]),
  ctxId: z.string(),
  image: z.lazy(() => z.union([ImageListProfileAPI, ImageAdminProfileAPI])),
  intent: ImageIntentIdSchema.nullish(),
  isPublished: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
})
