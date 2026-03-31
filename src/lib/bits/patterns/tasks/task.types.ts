import type { Task } from '$lib/types'
import type { AddressMeta } from '$lib/types'
import type { TaskEditorLayerOption as TaskEditorLayerOptionSchema } from '$lib/db/zod/schema/task.types'

export type TaskEditorLayerOption = TaskEditorLayerOptionSchema

export type TaskReviewUiAction =
  | 'reject'
  | 'accept'
  | 'acceptAll'
  | 'acceptClassified'
  | 'setIntangible'
  | 'setUnpublished'
  | 'setArchived'

export type TaskDescriptorItem = {
  label: string
  value: string
  wrap?: boolean
}

export type TaskFieldItem = {
  label: string
  value: string
}

export type TaskRootProps = {
  class?: string
  hasAside?: boolean
}

export type TaskMainProps = {
  class?: string
}

export type TaskAsideProps = {
  class?: string
}

export type TaskFooterProps = {
  class?: string
  readonly?: boolean
}

export type TaskDescriptorsProps = {
  title?: string
  items: TaskDescriptorItem[]
  class?: string
}

export type TaskFieldsProps = {
  title?: string
  items: TaskFieldItem[]
  emptyLabel?: string
  class?: string
}

export type TaskLayerProps = {
  title?: string | null
  currentLayerId: string | null
  options: TaskEditorLayerOption[]
  disabled?: boolean
  isBusy?: boolean
  class?: string
  onLayerChange?: (layerId: string) => void | Promise<void>
}

export type TaskMapProps = {
  coordinates: [number, number]
  addressMeta: AddressMeta | null
  mapStyleCode?: string | null
  class?: string
}

export type TaskEditorProps = {
  task: Task
  assignableLayers?: TaskEditorLayerOption[]
  canReassignLayer?: boolean
  isLayerBusy?: boolean
  class?: string
  onReview?: (action: TaskReviewUiAction, reviewReason?: string) => void | Promise<void>
  onReassignLayer?: (layerId: string) => void | Promise<void>
}
