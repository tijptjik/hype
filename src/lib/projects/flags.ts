// ZOD
import { z } from 'zod'

/** Extensible project preferences and publication policies. Missing flags retain their application defaults. */
export const ProjectFlagsSchema = z
  .object({
    autoPublishClassifiedImages: z.boolean().optional(),
    autoFeatureFirstImage: z.boolean().optional(),
    showHistoricalLayers: z.boolean().optional(),
    allowFeatureDescriptions: z.boolean().optional(),
    locationBasedFeatureNames: z.boolean().optional(),
    show3dAddressOptions: z.boolean().optional(),
  })
  .catchall(z.boolean())

export type ProjectFlags = z.infer<typeof ProjectFlagsSchema>

/**
 * Resolves whether Feature editors expose the building unit selector.
 * @param flags Persisted project flags, including older projects without flags.
 * @returns False only when the project explicitly disables 3D address options.
 */
export function show3dAddressOptions(flags?: ProjectFlags | null): boolean {
  return flags?.show3dAddressOptions !== false
}
