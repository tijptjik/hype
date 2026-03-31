import type { z } from 'zod'
import type { EntityResponse, ListQueryParams } from '$lib/types'
import type {
  GetTaskEditorDataSchema,
  GetTasksSchema,
  ReassignTaskLayerSchema,
  ReviewTaskSchema,
  SubmitMissingReportSchema,
  SubmitNewFeatureSchema,
  SubmitNewPhotosSchema,
  TaskAdminProfileAPI,
  TaskAPI,
  TaskBase,
  TaskBaseRaw,
  TaskCardProfileAPI,
  TaskCollectionAPI,
  TaskDetailProfileAPI,
  TaskEditorDataSchema,
  TaskEditorLayerOptionSchema,
  TaskInsert,
  TaskInsertAPI,
  TaskListProfileAPI,
  TaskProfile as TaskProfileSchema,
  TaskUpdate,
  TaskUpdateAPI,
} from '$lib/db/zod/schema/task'

export type TaskListParams = ListQueryParams
export type TaskProfile = z.infer<typeof TaskProfileSchema>
export type TaskListProfile = z.infer<typeof TaskListProfileAPI>
export type TaskCardProfile = z.infer<typeof TaskCardProfileAPI>
export type TaskDetailProfile = z.infer<typeof TaskDetailProfileAPI>
export type TaskAdminProfile = z.infer<typeof TaskAdminProfileAPI>

export type TaskEntityByProfile<P extends TaskProfile> = P extends 'admin'
  ? TaskAdminProfile
  : P extends 'detail'
    ? TaskDetailProfile
    : P extends 'card'
      ? TaskCardProfile
      : TaskListProfile

export type TaskListByProfile<P extends TaskProfile> = TaskEntityByProfile<P>

export type TaskGetParamsByProfile<P extends TaskProfile> = {
  id: string
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type TaskListParamsByProfile<P extends TaskProfile> = Omit<
  TaskListParams,
  'meta'
> & {
  meta?: {
    isAdminRequest?: boolean
    profile?: P
  }
}

export type TaskDB = z.infer<typeof TaskBase>
export type TaskDBRaw = z.infer<typeof TaskBaseRaw>
export type TaskDBNew = z.infer<typeof TaskInsert>
export type TaskDBPartial = z.infer<typeof TaskUpdate>

export type Task = z.infer<typeof TaskAPI>
export type TaskCollection = z.infer<typeof TaskCollectionAPI>
export type TaskNew = z.infer<typeof TaskInsertAPI>
export type TaskPartial = z.infer<typeof TaskUpdateAPI>

export type TaskEditorLayerOption = z.infer<typeof TaskEditorLayerOptionSchema>
export type TaskEditorData = z.infer<typeof TaskEditorDataSchema>
export type TaskGetResponse = EntityResponse<TaskAdminProfile>

export type GetTaskEditorDataInput = z.input<typeof GetTaskEditorDataSchema>
export type GetTasksInput = z.input<typeof GetTasksSchema>
export type ReviewTaskInput = z.input<typeof ReviewTaskSchema>
export type ReassignTaskLayerInput = z.input<typeof ReassignTaskLayerSchema>
export type SubmitMissingReportInput = z.input<typeof SubmitMissingReportSchema>
export type SubmitNewFeatureInput = z.input<typeof SubmitNewFeatureSchema>
export type SubmitNewPhotosInput = z.input<typeof SubmitNewPhotosSchema>
