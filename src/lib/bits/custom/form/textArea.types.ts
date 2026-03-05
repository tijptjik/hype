import type { LocaleExtended } from '$lib/types'
import type { FormIssueValue } from './textInput.types'

export interface TextAreaProps {
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
  rows?: number
  textareaAttrs?: Record<string, unknown>
  class?: string
  controlClass?: string
  onValueChange?: (value: string) => void
  onToggleGenAI?: (event?: Event) => void
}
