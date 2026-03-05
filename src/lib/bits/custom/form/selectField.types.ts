import type { SelectItem, SelectProps } from '$lib/bits/core/select/select.types'
import type { FormIssueValue } from './src/label/types'

export interface SelectFieldProps {
  id?: string
  name?: string
  label?: string
  value?: string
  items: SelectItem[]
  placeholder?: string
  required?: boolean
  isEditing?: boolean
  disabled?: boolean
  allowDeselect?: boolean
  variant?: SelectProps['variant']
  issues?: FormIssueValue
  class?: string
  selectClass?: string
  displayClass?: string
  triggerClass?: string
  contentClass?: string
  onValueChange?: (value: string) => void
}
