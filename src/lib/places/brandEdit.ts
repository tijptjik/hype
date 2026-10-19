// VALIDATION
import { z } from 'zod'
import { FeaturePlaceOverridesSchema } from './validation'

/** Explicit brand choice submitted with the association revision the editor viewed. */
export const PlaceBrandEditSchema = z.strictObject({
  expectedRevision: z.string().min(1),
  choice: FeaturePlaceOverridesSchema.shape.brands.unwrap(),
})

export type PlaceBrandEdit = z.infer<typeof PlaceBrandEditSchema>

/**
 * Decode the form's JSON envelope without turning malformed input into an empty edit.
 * @param value Form control text or an already decoded object.
 * @returns The parsed envelope, or the original input for normal validation failure.
 */
export function decodePlaceBrandEdit(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
