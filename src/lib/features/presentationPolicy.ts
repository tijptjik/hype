// TYPES
import type { ProjectFlags } from '#lib/projects/flags.js'
import type { LayerMetadata } from '#lib/db/zod/schema/layerMetadata.types.js'

/** Resolve Feature authoring preferences with explicit Layer overrides.
 * @param flags Project defaults; missing values preserve existing behavior.
 * @param metadata Layer preferences; null and absent values inherit the Project.
 * @returns Effective description availability and Location naming policy.
 */
export function resolveFeaturePresentationPolicy(flags?: ProjectFlags | null, metadata?: LayerMetadata | null): { allowDescriptions: boolean; locationBasedNames: boolean } {
  return {
    allowDescriptions: metadata?.allowFeatureDescriptions ?? flags?.allowFeatureDescriptions ?? true,
    locationBasedNames: metadata?.locationBasedFeatureNames ?? flags?.locationBasedFeatureNames ?? false,
  }
}
