import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'

export type SwitchState = boolean | null

export interface SwitchProps {
  checked?: SwitchState
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  states?: 2 | 3
  color?: ButtonColor
  rightColor?: ButtonColor
  leftColor?: ButtonColor
  midColor?: ButtonColor
  size?: ButtonSize
  leftText?: string
  rightText?: string
  topText?: string
  bottomText?: string
  showLabelsOnHoverOnly?: boolean
  class?: string
  thumbClass?: string
  onCheckedChange?: (checked: SwitchState) => void
}
