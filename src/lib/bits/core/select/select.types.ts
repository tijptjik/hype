export interface SelectItem {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
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
  contentClass?: string
  onValueChange?: (value: string) => void
}
