// VALIDATION
import { z } from 'zod'
import { SharedCorrectionValuesSchema } from './sharedCorrection'

/** Profile edits use the same validated fields as community curation. */
export const LocationProfileValuesSchema = SharedCorrectionValuesSchema.pick({
  phoneNumber: true,
  websites: true,
  socials: true,
  accessibility: true,
})
export const LocationProfileEditSchema = z.strictObject({
  expectedRevision: z.string().min(1),
  values: LocationProfileValuesSchema,
})
export type LocationProfileEdit = z.infer<typeof LocationProfileEditSchema>
