// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod';
// SCHEMA
import { task, taskImage } from '$lib/db/schema';
// ZOD SCHEMAS
import { UserBase } from './user';
import { ImageBase } from './image';

/* ----------------- */
// TASK SCHEMAS
/* -------- */

export const TaskBase = createSelectSchema(task);
export const TaskInsert = createInsertSchema(task).extend({
  // TODO - Confirm these are necessary
  type: z.enum(['reportedMissing', 'newPhoto', 'newFeature']),
  isReviewed: z.boolean().default(false),
  reviewOutcome: z.enum(['rejected', 'accepted']).optional(),
  reviewAction: z
    .enum([
      'ignored',
      'set-unpublished',
      'set-intangible',
      'set-archived',
      'added-all-photos',
      'added-all-photos-with-intent',
      'added-feature'
    ])
    .optional()
});

export const TaskUpdate = createUpdateSchema(task);

/* ----------------- */
// TASK RELATIONAL SCHEMAS :: IMAGES 
/* -------- */
export const TaskImageBase = createSelectSchema(taskImage);
export const TaskImageInsert = createInsertSchema(taskImage);
export const TaskImageUpdate = createUpdateSchema(taskImage);

/* ----------------- */
// TASK API SCHEMAS
/* -------- */
export const TaskAPI = TaskBase.extend({
  organisation: z.any().optional(),
  project: z.any().optional(),
  feature: z.any().optional(),
  // TODO confirm whether it's images or taskImages
  images: z.array(ImageBase).optional(),
  taskImages: z.array(TaskImageInsert).optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskInsertAPI = TaskInsert.extend({
  // TODO confirm whether these are necessary
  organisation: z.any().optional(),
  project: z.any().optional(),
  feature: z.any().optional(),
  images: z.array(ImageBase).optional(),
  taskImages: z.array(TaskImageInsert).optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskUpdateAPI = TaskUpdate.extend({
  // TODO confirm whether these are necessary
  organisation: z.any().optional(),
  project: z.any().optional(),
  feature: z.any().optional(),
  images: z.array(ImageBase).optional(),
  taskImages: z.array(TaskImageUpdate).optional(),
  contributor: UserBase.optional(),
  reviewer: UserBase.optional()
});

export const TaskImageUpdateAPI = TaskImageUpdate.extend({
  task: z.any().optional(),
  image: ImageBase.optional()
});

// TODO Remove once we've migrated to the new schemas

/* ----------------- */
// DEPRECATED TASK SCHEMAS
/* -------- */


/* ----------------- */
// TASKS
// /* -------- */

// // Base schemas
// export const TaskBase = createSelectSchema(task);
// export const TaskInsert = createInsertSchema(task).extend({
//   id: z.string().optional(),
//   type: z.enum(['reportedMissing', 'newPhoto', 'newFeature']),
//   isReviewed: z.boolean().default(false),
//   reviewOutcome: z.enum(['rejected', 'accepted']).optional(),
//   reviewAction: z
//     .enum([
//       'ignored',
//       'set-unpublished',
//       'set-intangible',
//       'set-archived',
//       'added-all-photos',
//       'added-all-photos-with-intent',
//       'added-feature'
//     ])
//     .optional()
// });

// export const TaskUpdate = TaskInsert.extend({
//   id: z.string()
// });

/* ----------------- */
// TASK IMAGES
/* -------- */

// // Base schemas
// export const TaskImageBase = createSelectSchema(taskImage);
// export const TaskImageInsert = createInsertSchema(taskImage).extend({
//   isPrimary: z.boolean().default(false)
// });

// export const TaskImageUpdate = TaskImageInsert.extend({
//   taskId: z.string(),
//   imageId: z.string()
// });

// export const TaskImageUpdateAPI = TaskImageUpdate.extend({
//   task: TaskBase.optional(),
//   image: ImageBase.optional()
// });

// export const TaskInsertAPI = TaskInsert.extend({
//   organisation: OrganisationBase.optional(),
//   project: ProjectBase.optional(),
//   feature: FeatureInsertAPI.optional(),
//   images: z.array(ImageBase).optional(),
//   taskImages: z.array(TaskImageInsert).optional(),
//   contributor: UserBase.optional(),
//   reviewer: UserBase.optional()
// });

// export const TaskUpdateAPI = TaskUpdate.extend({
//   organisation: OrganisationBase.optional(),
//   project: ProjectBase.optional(),
//   feature: FeatureUpdateAPI.optional(),
//   images: z.array(ImageBase).optional(),
//   taskImages: z.array(TaskImageUpdate).optional(),
//   contributor: UserBase.optional(),
//   reviewer: UserBase.optional()
// });

// export const TaskPatch = TaskUpdate.partial();
