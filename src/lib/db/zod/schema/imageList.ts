// DRIZZLE
import { createSelectSchema } from 'drizzle-zod'
import { image } from '#lib/db/schema/image.js'

export const ImageListFields = createSelectSchema(image).pick({
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
