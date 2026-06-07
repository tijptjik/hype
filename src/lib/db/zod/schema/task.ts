// ZOD
import { z } from 'zod'
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod'
// SCHEMA
import { task, taskImage } from '$lib/db/schema/index'
// ZOD SCHEMAS
import { ListQueryParamsSchema } from './api'
import { UserBasic } from './user'
import { ImageBase } from './image'
import {
  FeatureAdminProfileAPI,
  FeatureBase,
  FeatureI18nBase,
  FeaturePropertyAPI,
} from './feature'
import { LayerI18nRecord } from './layer'
import { ProjectBase, ProjectI18nBase } from './project'
import { OrganisationBase, OrganisationI18nBase } from './organisation'
import {
  PropertyI18nRecord,
  PropertyRecord,
  PropertyValueI18nRecord,
  PropertyValueRecord,
} from './property'
// ENUMS
import { TaskType, TaskReviewOutcome, TaskReviewAction } from '$lib/enums'
import { getLocales } from '..'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DB / RELATIONAL PRIMITIVES
//    - TaskBase
//    - TaskInsert
//    - TaskUpdate
//    - TaskImageBase
//    - TaskImageInsert
//    - TaskImageUpdate
//
// 2. INTERMEDIATE RAW SCHEMAS
//    - TaskBaseRaw
//
// 3. LEGACY API SCHEMAS
//    - TaskCollectionAPI
//    - TaskAPI
//    - TaskInsertAPI
//    - TaskUpdateAPI
//    - TaskImageUpdateAPI
//
// 4. REMOTE TASK SCHEMAS
//    - TaskRemoteMetaSchema
//    - GetTaskEditorDataSchema
//    - GetTasksSchema
//    - ReviewTaskSchema
//    - ReassignTaskLayerSchema
//    - TaskEditorLayerOptionSchema
//    - TaskEditorDataSchema
//    - BeginMissingReportDraftSchema
//    - BeginNewFeatureDraftSchema
//    - BeginNewPhotosDraftSchema
//    - FinalizeTaskDraftSchema
//    - SubmitMissingReportSchema
//    - SubmitNewFeatureSchema
//    - SubmitNewPhotosSchema

// ═══════════════════════
// 1. DB / RELATIONAL PRIMITIVES
// ═══════════════════════

export const TaskBase = createSelectSchema(task).extend({
  type: z.enum(Object.values(TaskType) as [string, ...string[]]),
})
export const TaskInsert = createInsertSchema(task).extend({
  type: z.enum(Object.values(TaskType) as [string, ...string[]]),
  isDraft: z.boolean().prefault(true),
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
  isDraft: z.boolean().optional(),
  reviewOutcome: z
    .enum(Object.values(TaskReviewOutcome) as [string, ...string[]])
    .optional(),
  reviewAction: z
    .enum(Object.values(TaskReviewAction) as [string, ...string[]])
    .optional(),
})

export const TaskImageBase = createSelectSchema(taskImage)
export const TaskImageInsert = createInsertSchema(taskImage)
export const TaskImageUpdate = createUpdateSchema(taskImage)

// ═══════════════════════
// 2. INTERMEDIATE RAW SCHEMAS
// ═══════════════════════

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
          property: PropertyRecord.extend({
            i18n: z.array(PropertyI18nRecord).optional().nullable(),
          }),
          propertyValue: PropertyValueRecord.extend({
            i18n: z.array(PropertyValueI18nRecord).optional().nullable(),
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

// ═══════════════════════
// 3. REMOTE PROFILE SCHEMAS
// ═══════════════════════

export const TaskProfile = z.enum(['list', 'card', 'detail', 'admin'])

export const TaskListProfileAPI = TaskBase.extend({
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

export const TaskCardProfileAPI = TaskListProfileAPI

export const TaskDetailProfileAPI = TaskListProfileAPI

export const TaskEditorLayerOptionSchema = z.object({
  id: z.string().min(1),
  code: z.string().nullable(),
  projectId: z.string().min(1),
  i18n: getLocales(LayerI18nRecord),
})

export const TaskAdminProfileAPI = TaskBase.extend({
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
        property: PropertyRecord.extend({
          i18n: getLocales(PropertyI18nRecord),
        }),
        propertyValue: PropertyValueRecord.extend({
          i18n: getLocales(PropertyValueI18nRecord),
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
  assignableLayers: z.array(TaskEditorLayerOptionSchema).default([]),
  canReassignLayer: z.boolean().default(false),
})

export const TaskCollectionAPI = TaskListProfileAPI

export const TaskAPI = TaskAdminProfileAPI

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
  // Other task types need a featureId and can have complete feature admin payloads
  TaskInsert.extend({
    type: z.enum(['reportedMissing', 'newPhoto']),
    feature: FeatureAdminProfileAPI.optional(),
    organisation: OrganisationBase.optional(),
    project: ProjectBase.optional(),
    images: z.array(TaskImageInsert).optional(),
    contributor: UserBasic.optional(),
  }),
])

export const TaskUpdateAPI = TaskUpdate.extend({
  organisation: OrganisationBase.optional(),
  project: ProjectBase.optional(),
  feature: FeatureAdminProfileAPI.optional(),
  images: z.array(TaskImageUpdate).optional(),
  contributor: UserBasic.optional(),
  reviewer: UserBasic.optional(),
})

export const TaskImageUpdateAPI = TaskImageUpdate.extend({
  task: TaskBase.optional(),
  image: ImageBase.optional(),
})

// ═══════════════════════
// 4. REMOTE TASK SCHEMAS
// ═══════════════════════

const TaskUploadFileSchema = z.custom<File>(value => value instanceof File, {
  message: 'Expected File',
})

export const TaskRemoteMetaSchema = z
  .object({
    isAdminRequest: z.boolean().optional(),
    profile: TaskProfile.optional(),
  })
  .optional()

export const GetTaskEditorDataSchema = z.object({
  id: z.string().min(1),
  meta: TaskRemoteMetaSchema,
})

export const GetTasksSchema = ListQueryParamsSchema.extend({
  conditions: z
    .object({
      isDraft: z.boolean().nullable().optional(),
      isReviewed: z.boolean().nullable().optional(),
      type: z
        .enum(Object.values(TaskType) as [string, ...string[]])
        .nullable()
        .optional(),
    })
    .optional(),
  prisms: z
    .object({
      organisation: z.array(z.string()).optional(),
      project: z.array(z.string()).optional(),
    })
    .optional(),
  meta: TaskRemoteMetaSchema,
})

export const ReviewTaskSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
    'reject',
    'accept',
    'acceptAll',
    'acceptClassified',
    'setIntangible',
    'setUnpublished',
    'setArchived',
  ]),
  reviewReason: z.string().trim().optional(),
  meta: TaskRemoteMetaSchema,
})

export const ReassignTaskLayerSchema = z.object({
  id: z.string().min(1),
  layerId: z.string().min(1),
  meta: TaskRemoteMetaSchema,
})

export const TaskEditorDataSchema = z.object({
  task: TaskAPI,
  assignableLayers: z.array(TaskEditorLayerOptionSchema),
  canReassignLayer: z.boolean(),
})

export const BeginMissingReportDraftSchema = z.object({
  featureId: z.string().min(1),
  layerId: z.string().min(1),
  projectId: z.string().min(1),
  organisationId: z.string().min(1),
  reason: z.string().trim(),
  meta: TaskRemoteMetaSchema,
})

export const BeginNewFeatureDraftSchema = z.object({
  task: z.object({
    taskId: z.string().min(1).optional(),
    layerId: z.string().min(1),
    organisationId: z.string().min(1),
    projectId: z.string().min(1),
    contributorId: z.string().min(1).optional(),
    type: z.literal('newFeature'),
    feature: z.any(),
    featureId: z.string().min(1).optional(),
  }),
  meta: TaskRemoteMetaSchema,
})

export const BeginNewPhotosDraftSchema = z.object({
  featureId: z.string().min(1),
  layerId: z.string().min(1),
  projectId: z.string().min(1),
  organisationId: z.string().min(1),
  meta: TaskRemoteMetaSchema,
})

export const FinalizeTaskDraftSchema = z.object({
  id: z.string().min(1),
  meta: TaskRemoteMetaSchema,
})

export const SubmitMissingReportSchema = z.object({
  featureId: z.string().min(1),
  layerId: z.string().min(1),
  projectId: z.string().min(1),
  organisationId: z.string().min(1),
  reason: z.string().trim(),
  photos: z.array(TaskUploadFileSchema),
  meta: TaskRemoteMetaSchema,
})

export const SubmitNewFeatureSchema = z.object({
  task: z.object({
    layerId: z.string().min(1),
    organisationId: z.string().min(1),
    projectId: z.string().min(1),
    contributorId: z.string().min(1),
    type: z.literal('newFeature'),
    feature: z.any(),
    featureId: z.string().min(1).optional(),
  }),
  photos: z.array(TaskUploadFileSchema),
  meta: TaskRemoteMetaSchema,
})

export const SubmitNewPhotosSchema = z.object({
  featureId: z.string().min(1),
  layerId: z.string().min(1),
  projectId: z.string().min(1),
  organisationId: z.string().min(1),
  photos: z.array(TaskUploadFileSchema),
  meta: TaskRemoteMetaSchema,
})
