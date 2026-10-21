// VALIDATION
import { z } from 'zod'

/** Description-derived capture values retain the precision and timezone actually expressed. */
export const ImageCapturePrecisionSchema = z.enum([
  'year',
  'month',
  'day',
  'minute',
  'second',
])

export const ImageCaptureSchema = z.object({
  value: z.string().min(1),
  precision: ImageCapturePrecisionSchema,
  endValue: z.string().nullable(),
  endPrecision: ImageCapturePrecisionSchema.nullable(),
  approximate: z.boolean(),
  originalText: z.string().min(1),
})

export const ImageCaptureSourceSchema = z.object({
  featureId: z.string(),
  locale: z.string(),
  descriptionHash: z.string(),
  revision: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quotedText: z.string(),
  orderedImageIds: z.array(z.string()),
  orderEvidence: z.string(),
})

export type ImageCapture = z.infer<typeof ImageCaptureSchema>
export type ImageCaptureSource = z.infer<typeof ImageCaptureSourceSchema>
