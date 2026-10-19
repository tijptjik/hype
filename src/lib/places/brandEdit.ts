// VALIDATION
import { z } from 'zod'
import { FeaturePlaceOverridesSchema } from './validation'

/** Explicit brand choice submitted with the association revision the editor viewed. */
export const PlaceBrandEditSchema = z.strictObject({
  expectedRevision: z.string().min(1),
  choice: FeaturePlaceOverridesSchema.shape.brands.unwrap(),
})

export type PlaceBrandEdit = z.infer<typeof PlaceBrandEditSchema>
