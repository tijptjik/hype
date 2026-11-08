// ZOD
import { z } from 'zod'
// CAPTURE
import { ImageCaptureSchema, ImageCaptureSourceSchema } from '#lib/images/capture.js'

export const ImageMetadataBasicSchema = z.object({
  originalFilename: z.string().nullish(),
  originalExtension: z.string().nullish(),
  contentHash: z.string().nullish(),
  originalWidth: z.number().int().nullish(),
  originalHeight: z.number().int().nullish(),
  rotation: z.number().int().min(0).max(270).nullish(),
  sourceRotation: z.number().int().min(0).max(270).nullish(),
  renderRotation: z.number().int().min(0).max(270).nullish(),
  cameraModel: z.string().nullish(),
  capturedAt: z.string().nullish(),
  // Authored capture assertions remain separate from extracted EXIF instants.
  capture: ImageCaptureSchema.nullish(),
  credit: z.string().nullish(),
  latitude: z.string().nullish(),
  longitude: z.string().nullish(),
})

export const ImageMetadataFullSchema = ImageMetadataBasicSchema.extend({
  captureSources: z.array(ImageCaptureSourceSchema).nullish(),
  metadata: z.record(z.string(), z.string()).nullish(),
  sourceVersion: z.number().int().nullish(),
  uploadedAt: z.string().nullish(),
  modifiedAt: z.string().nullish(),
})

export const ImageMetadataProfileSchema = z.enum(['basic', 'full', 'auto', 'admin'])
