import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'

export interface CheckboxProps {
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
  required?: boolean
  readonly?: boolean
  name?: string
  value?: string
  id?: string
  color?: ButtonColor
  size?: ButtonSize
  leftText?: string
  rightText?: string
  topText?: string
  bottomText?: string
  showLabelsOnHoverOnly?: boolean
  class?: string
  onCheckedChange?: (checked: boolean) => void
  onIndeterminateChange?: (indeterminate: boolean) => void
}
