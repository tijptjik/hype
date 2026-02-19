import type { InputType, LocaleExtended } from '$lib/types'
import type { FormIssueValue } from './src/label/types'

export interface TextInputProps {
  id?: string
  name?: string
  label?: string
  value?: string
  isEditing?: boolean
  placeholder?: string
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  issues?: FormIssueValue
  locale?: LocaleExtended
  isTranslated?: boolean
  isGenAI?: boolean
  inputType?: InputType
  inputAttrs?: Record<string, unknown>
  class?: string
  controlClass?: string
  inputClass?: string
  onValueChange?: (value: string) => void
  onToggleGenAI?: (event: MouseEvent) => void
}
