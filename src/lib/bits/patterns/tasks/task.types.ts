import type { ProfileLocaleState } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { AddressMeta } from '#lib/utils/address.types.js'
import type { TaskEditorLayerOption as TaskEditorLayerOptionSchema } from '#lib/db/zod/schema/task.types.js'

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
  compact?: boolean
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
  loading?: boolean
  title?: string | null
  currentLayerId: string | null
  options: TaskEditorLayerOption[]
  disabled?: boolean
  isBusy?: boolean
  class?: string
  onLayerChange?: (layerId: string) => void | Promise<void>
}

export type TaskMapProps = {
  initialZoom?: number
  showFullscreen?: boolean
  expandOnClick?: boolean
  label?: string
  coordinates: [number, number] | null
  loading?: boolean
  comparison?: { before: [number, number]; after: [number, number] } | null
  addressMeta: AddressMeta | null
  mapStyleCode?: string | null
  class?: string
}

export type TaskEditorProps = {
  onImageAcceptActionChange?: (
    action:
      | {
          taskId: string
          disabled: boolean
          accept: (mode?: 'acceptAll' | 'acceptClassified') => Promise<void>
        }
      | undefined,
  ) => void
  onImagesAccepted?: () => Promise<void>
  onImageReviewChange?: (
    value:
      | { taskId: string; reviewId: string | null; proposalVersion: string }
      | undefined,
    busy: boolean,
    waitForOrder: () => Promise<boolean>,
  ) => void
  localeState?: ProfileLocaleState
  onLocaleStateChange?: (state: ProfileLocaleState) => void
  task: Task | null
  assignableLayers?: TaskEditorLayerOption[]
  canReassignLayer?: boolean
  isLayerBusy?: boolean
  class?: string
  onReview?: (action: TaskReviewUiAction, reviewReason?: string) => void | Promise<void>
  onReassignLayer?: (layerId: string) => void | Promise<void>
}
