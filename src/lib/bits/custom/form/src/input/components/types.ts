import type { InputType, LocaleExtended } from '$lib/types'

export interface FormControlPrimitiveProps {
  id?: string
  name?: string
  value?: string
  placeholder?: string
  locale?: LocaleExtended
  isTranslated?: boolean
  disabled?: boolean
  readonly?: boolean
  class?: string
  attrs?: Record<string, unknown>
  onValueChange?: (value: string) => void
}

export interface FormInputPrimitiveProps extends FormControlPrimitiveProps {
  type?: InputType
}

export interface FormTextAreaPrimitiveProps extends FormControlPrimitiveProps {
  rows?: number
}

export interface FormGenAIProps {
  isGenAI: boolean
  disabled?: boolean
  onToggle?: (event: MouseEvent) => void
  class?: string
}
