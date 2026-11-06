// DRIZZLE
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { image } from '#lib/db/schema/image.js'

export const ImageListFields = createSelectSchema(image)
  .pick({
    id: true,
    cdn: true,
    env: true,
    cdnId: true,
    publicId: true,
    contentHash: true,
    version: true,
    presentationMode: true,
    contributorId: true,
    createdAt: true,
    modifiedAt: true,
  })
  .extend({
    imageRevisionId: z.string().optional(),
    galleryPosition: z.number().int().nonnegative().optional(),
    galleryCaption: z.record(z.string(), z.string()).optional(),
    galleryAlt: z.record(z.string(), z.string()).optional(),
  })
