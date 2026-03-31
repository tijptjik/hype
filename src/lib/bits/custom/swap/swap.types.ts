import type { Component } from 'svelte'
import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'

export type SwapVariant = 'default' | 'transparent'

export interface SwapProps {
  checked?: boolean
  disabled?: boolean
  onIcon?: Component | null
  offIcon?: Component | null
  size?: ButtonSize
  variant?: SwapVariant
  onColor?: ButtonColor
  offColor?: ButtonColor
  label?: string
  attrs?: Record<string, unknown>
  class?: string
  type?: 'button' | 'submit' | 'reset'
  onCheckedChange?: (checked: boolean) => void
}
