// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { image, featureImage } from '$lib/db/schema';
// ZOD SCHEMAS
import { FeatureBase } from './feature';

/* ----------------- */
// IMAGE CORE SCHEMAS
/* -------- */

export const ImageBase = createSelectSchema(image);
export const ImageInsert = createInsertSchema(image).extend({
  id: z.string().optional(),
  publicId: z.string().min(1, 'Public ID is required'),
  cdn: z.enum(['cloudinary']).default('cloudinary'),
  contributorId: z.string(),
  capturedAt: z.string()
});
export const ImageUpdate = createUpdateSchema(image);

/* ----------------- */
// IMAGE RELATIONAL SCHEMAS : FEATURE
/* -------- */

export const FeatureImageBase = createSelectSchema(featureImage);
export const FeatureImageInsert = createInsertSchema(featureImage).extend({
  featureId: z.string(),
  intent: z
    .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
    .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.string().optional()
});

export const FeatureImageUpdate = createUpdateSchema(featureImage);


/* ----------------- */
// IMAGE API SCHEMAS
/* -------- */

export const ImageAPI = ImageBase.extend({
  featureId: z.string().optional(),
  attribution: z.string().optional(),
  intent: z
    .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
    .default('undefined'),
  isPublished: z.boolean().default(false),
  publishedAt: z.coerce.date()
});

export const ImageInsertAPI = ImageInsert.extend({
  featureImage: FeatureImageInsert.omit({ imageId: true }).optional(),
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string()
});

export const ImageUpdateAPI = ImageUpdate.extend({
  featureImage: FeatureImageUpdate.optional(),
  refType: z.enum(['feature', 'project', 'organisation']),
  refId: z.string()
});

export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
  feature: FeatureBase.optional(),
  image: ImageBase.optional()
});



// TODO Remove once we've migrated to the new schemas
/* ----------------- */
// DEPRECATED IMAGE SCHEMAS
/* -------- */


// // Base schemas
// export const ImageBase = createSelectSchema(image);
// export const ImageInsert = createInsertSchema(image).extend({
//   id: z.string().optional(),
//   publicId: z.string().min(1, 'Public ID is required'),
//   cdn: z.enum(['cloudinary']).default('cloudinary'),
//   contributorId: z.string(),
//   capturedAt: z.string()
// });

// export const ImageUpdate = ImageInsert.extend({
//   id: z.string()
// });

// // Feature Images (Join Table)
// export const FeatureImageBase = createSelectSchema(featureImage);
// export const FeatureImageInsert = createInsertSchema(featureImage).extend({
//   featureId: z.string(),
//   intent: z
//     .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
//     .default('undefined'),
//   isPublished: z.boolean().default(false),
//   publishedAt: z.string().optional()
// });
// // TODO Give this the correct name
// export const FeatureImageInserts = FeatureImageInsert.omit({ imageId: true });

// export const FeatureImageUpdate = FeatureImageInsert.extend({
//   featureId: z.string(),
//   imageId: z.string()
// });

// export const FeatureImageUpdateAPI = FeatureImageUpdate.extend({
//   feature: FeatureBase.optional(),
//   image: ImageBase.optional()
// });

// export const ImageInsertAPI = ImageInsert.extend({
//   featureImage: FeatureImageInserts.optional(),
//   // RELATED ENTITY
//   refType: z.enum(['feature', 'project', 'organisation']),
//   refId: z.string()
// });

// export const ImageUpdateAPI = ImageUpdate.extend({
//   featureImage: FeatureImageUpdate.optional(),
//   // RELATED ENTITY
//   refType: z.enum(['feature', 'project', 'organisation']),
//   refId: z.string()
// });

// export const ImageGetAPI = ImageUpdate.extend({
//   featureId: z.string(),
//   attribution: z.string().optional(),
//   intent: z
//     .enum(['canonical', 'closeUp', 'context', 'general', 'evidence', 'undefined'])
//     .default('undefined'),
//   isPublished: z.boolean().default(false),
//   publishedAt: z.coerce.date()
// });

// export const ImagePatch = ImageUpdate.partial();



