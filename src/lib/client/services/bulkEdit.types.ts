// TYPES
import type { FeatureDB } from '#lib/db/zod/schema/feature.types.js'
import type { Id } from '#lib/types.js'

export type ResourceBulkEditOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ResourceBulkEditProgress = {
  completed: number
  total: number
  errors: number
  isApplying: boolean
}

export type ResourceBulkEditConfig = {
  isActive: boolean
  selectedCount: number
  options: ResourceBulkEditOption[]
  selectedOptionValue: string
  progress?: ResourceBulkEditProgress | null
  applyDisabled?: boolean
  onToggleMode: () => void
  onInvertSelection: () => void
  onOptionChange: (value: string) => void
  onApply: () => void | Promise<void>
}

export type ResourceIndexRowSelectionState = 'selected' | 'success' | 'error'

export type FeatureBulkStateResult =
  | {
      id: Id
      ok: true
      data: FeatureDB
    }
  | {
      id: Id
      ok: false
      error: string
    }
