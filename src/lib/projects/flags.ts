// ZOD
import { z } from 'zod'

/** Extensible project preferences and publication policies. Missing flags retain their application defaults. */
export const ProjectFlagsSchema = z
  .object({
    autoPublishClassifiedImages: z.boolean().optional(),
    autoFeatureFirstImage: z.boolean().optional(),
  })
  .catchall(z.boolean())

export type ProjectFlags = z.infer<typeof ProjectFlagsSchema>
