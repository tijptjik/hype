// SVELTE
import type { Snippet } from 'svelte'

export interface SelectItem {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  itemPreview?: Snippet<[value: string]>
  value?: string
  items: SelectItem[]
  placeholder?: string
  variant?: 'default' | 'ghost'
  isEditing?: boolean
  allowDeselect?: boolean
  disabled?: boolean
  name?: string
  class?: string
  displayClass?: string
  triggerClass?: string
  triggerAttrs?: Record<string, unknown>
  contentClass?: string
  onValueChange?: (value: string) => void
}
