// VALIDATION
import { z } from 'zod'
import { FeatureLocationOverridesSchema } from './validation'

/** Explicit brand choice submitted with the association revision the editor viewed. */
export const LocationBrandEditSchema = z.strictObject({
  expectedRevision: z.string().min(1),
  choice: FeatureLocationOverridesSchema.shape.brands.unwrap(),
})

export type LocationBrandEdit = z.infer<typeof LocationBrandEditSchema>
