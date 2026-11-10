import type { Component, Snippet } from 'svelte'
import type { InputType, LocaleExtended } from '#lib/types.js'
import type { FormIssueValue } from './src/label/types'

export interface TextInputProps {
  id?: string
  name?: string
  label?: string
  labelIcon?: Component<{ class?: string }>
  labelRight?: Snippet
  /** Optional action inside the control, after the editable value. */
  trailing?: Snippet
  value?: string
  isEditing?: boolean
  /** Resource editors use borderless display and a subtle outline while editing. */
  variant?: 'default' | 'resource'
  placeholder?: string
  prefix?: string
  fitValue?: boolean
  fitMinWidth?: string
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  issues?: FormIssueValue
  errorId?: string
  locale?: LocaleExtended
  isTranslated?: boolean
  isGenAI?: boolean
  /** Preserve authored whitespace when false; defaults to trimming on blur. */
  trimOnBlur?: boolean
  inputType?: InputType
  inputAttrs?: Record<string, unknown>
  class?: string
  controlClass?: string
  inputClass?: string
  onValueChange?: (value: string) => void
  onToggleGenAI?: (event?: Event) => void
}
