import type { InputType, LocaleExtended } from '$lib/types'

export type FormErrorValue = string | string[] | null | undefined

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
  error?: FormErrorValue
  locale?: LocaleExtended
  isTranslated?: boolean
  isGenAI?: boolean
  inputType?: InputType
  inputAttrs?: Record<string, unknown>
  class?: string
  controlClass?: string
  onValueChange?: (value: string) => void
  onToggleGenAI?: (event: MouseEvent) => void
}
