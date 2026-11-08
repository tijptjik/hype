// IMAGE INTENTS
import { ImageIntentIdSchema } from '#lib/images/intents.js'
// VALIDATION
import { z } from 'zod'

/** Only selectors and explicit edits cross the request boundary; snapshots remain server-owned. */
export const FeatureIdentitySelectionSchema = z.object({
  kind: z.enum(['merge', 'split']),
  inputs: z
    .array(
      z.object({
        featureId: z.string().min(1),
        revisionId: z.string().min(1),
        generation: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(20),
  outputs: z
    .array(
      z.object({
        featureId: z.string().min(1).nullable(),
        sourceFeatureId: z.string().min(1),
        profileEdits: z
          .object({
            isIntangible: z.boolean().optional(),
            isVisitable: z.boolean().optional(),
            asOf: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable()
              .optional(),
          })
          .optional(),
        propertyOptionEdits: z
          .record(z.string(), z.string().min(1).nullable())
          .optional(),
        propertyTranslationEdits: z
          .record(z.string(), z.record(z.string(), z.string().nullable()))
          .optional(),
        propertyEdits: z.record(z.string(), z.string().nullable()).optional(),
        profileSourceFeatureId: z.string().min(1).optional(),
        placementSourceFeatureId: z.string().min(1).optional(),
        descriptions: z.record(z.string(), z.string().nullable()).optional(),
        titles: z.record(z.string(), z.string()).optional(),
        images: z
          .array(
            z.object({
              sourceFeatureId: z.string().min(1),
              imageId: z.string().min(1),
              intent: ImageIntentIdSchema.optional(),
            }),
          )
          .optional(),
        coverImageId: z.string().min(1).optional(),
        properties: z
          .array(
            z.object({
              sourceFeatureId: z.string().min(1),
              propertyId: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(20),
  redirectOutputIndex: z.number().int().nonnegative().nullable().optional(),
  reason: z.string().trim().min(1).max(2000),
})
export type FeatureIdentitySelection = z.infer<typeof FeatureIdentitySelectionSchema>
