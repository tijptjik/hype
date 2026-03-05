// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// SCHEMA
import { task, taskImage } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { UserBasic } from './user'
import { ImageBase } from './image'
import { FeatureAPI, FeatureBase, FeatureI18nBase, FeaturePropertyAPI } from './feature'
import { ProjectBase, ProjectI18nBase } from './deprecated/project'
import { OrganisationBase, OrganisationI18nBase } from './deprecated/organisation'
import {
  PropertyBase,
  PropertyI18nBase,
  PropertyValueBase,
  PropertyValueI18nBase,
} from './deprecated/property'
// ENUMS
import { TaskType, TaskReviewOutcome, TaskReviewAction } from '$lib/enums'
import { getLocales } from '..'

/* ----------------- */
// TASK CORE
/* -------- */

export const TaskBase = createSelectSchema(task).extend({
  type: z.enum(Object.values(TaskType) as [string, ...string[]]),
})
export const TaskInsert = createInsertSchema(task).extend({
  type: z.enum(Object.values(TaskType) as [string, ...string[]]),
  isReviewed: z.boolean().prefault(false),
  reviewOutcome: z
    .enum(Object.values(TaskReviewOutcome) as [string, ...string[]])
    .optional(),
  reviewAction: z
    .enum(Object.values(TaskReviewAction) as [string, ...string[]])
    .optional(),
})
export const TaskUpdate = createUpdateSchema(task).extend({
  type: z.enum(Object.values(TaskType) as [string, ...string[]]).optional(),
  reviewOutcome: z
    .enum(Object.values(TaskReviewOutcome) as [string, ...string[]])
    .optional(),
  reviewAction: z
    .enum(Object.values(TaskReviewAction) as [string, ...string[]])
    .optional(),
})

/* ----------------- */
// TASK RELATIONAL SCHEMAS :: IMAGES
/* -------- */

export const TaskImageBase = createSelectSchema(taskImage)
export const TaskImageInsert = createInsertSchema(taskImage)
export const TaskImageUpdate = createUpdateSchema(taskImage)

/* ----------------- */
// TASK API SCHEMAS
/* -------- */

export const TaskBaseRaw = TaskBase.extend({
  organisation: OrganisationBase.extend({
    i18n: z.array(OrganisationI18nBase).optional().nullable(),
  }).nullish(),
  project: ProjectBase.extend({
    i18n: z.array(ProjectI18nBase).optional().nullable(),
  }).nullish(),
  feature: FeatureBase.extend({
    i18n: z.array(FeatureI18nBase).optional().nullable(),
    properties: z
      .array(
        FeaturePropertyAPI.extend({
          property: PropertyBase.extend({
            i18n: z.array(PropertyI18nBase).optional().nullable(),
          }),
          propertyValue: PropertyValueBase.extend({
            i18n: z.array(PropertyValueI18nBase).optional().nullable(),
          })
            .optional()
            .nullable(),
        }),
      )
      .optional()
      .nullable(),
  }).nullish(),
  images: z
    .array(
      TaskImageBase.extend({
        image: ImageBase.optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  contributor: UserBasic.optional().nullable(),
  reviewer: UserBasic.optional().nullable(),
})

export const TaskCollectionAPI = TaskBase.extend({
  organisation: OrganisationBase.extend({
    i18n: getLocales(OrganisationI18nBase),
  }),
  project: ProjectBase.extend({
    i18n: getLocales(ProjectI18nBase),
  }),
  feature: FeatureBase.extend({
    i18n: getLocales(FeatureI18nBase),
  }),
  images: z
    .array(
      TaskImageBase.extend({
        image: ImageBase,
      }),
    )
    .optional(),
  contributor: UserBasic.optional().nullable(),
  reviewer: UserBasic.optional().nullable(),
})

export const TaskAPI = TaskBase.extend({
  organisation: OrganisationBase.extend({
    i18n: getLocales(OrganisationI18nBase),
  }),
  project: ProjectBase.extend({
    i18n: getLocales(ProjectI18nBase),
  }),
  feature: FeatureBase.extend({
    i18n: getLocales(FeatureI18nBase),
    properties: z.array(
      FeaturePropertyAPI.extend({
        property: PropertyBase.extend({
          i18n: getLocales(PropertyI18nBase),
        }),
        propertyValue: PropertyValueBase.extend({
          i18n: getLocales(PropertyValueI18nBase),
        })
          .optional()
          .nullable(),
      }),
    ),
  }),
  images: z
    .array(
      TaskImageBase.extend({
        image: ImageBase.optional().nullable(),
      }),
    )
    .optional(),
  contributor: UserBasic.optional().nullable(),
  reviewer: UserBasic.optional().nullable(),
})

export const TaskInsertAPI = z.discriminatedUnion('type', [
  // newFeature tasks can have any raw feature data - validation happens during feature creation
  TaskInsert.extend({
    type: z.literal('newFeature'),
    feature: z.any().optional(), // Accept any feature data without validation
    organisation: OrganisationBase.optional(),
    project: ProjectBase.optional(),
    images: z.array(TaskImageInsert).optional(),
    contributor: UserBasic.optional(),
  }),
  // Other task types need a featureId and can have complete FeatureAPI
  TaskInsert.extend({
    type: z.enum(['reportedMissing', 'newPhoto']),
    feature: FeatureAPI.optional(),
    organisation: OrganisationBase.optional(),
    project: ProjectBase.optional(),
    images: z.array(TaskImageInsert).optional(),
    contributor: UserBasic.optional(),
  }),
])

export const TaskUpdateAPI = TaskUpdate.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureAPI.optional(),
  images: z.array(TaskImageUpdate).optional(),
  contributor: UserBasic.optional(),
  reviewer: UserBasic.optional(),
})

export const TaskImageUpdateAPI = TaskImageUpdate.extend({
  task: TaskBase.optional(),
  image: ImageBase.optional(),
})
