import type { Snippet } from 'svelte'
import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'

export interface SwapProps {
  checked?: boolean
  disabled?: boolean
  onIcon?: Snippet
  offIcon?: Snippet
  size?: ButtonSize
  onColor?: ButtonColor
  offColor?: ButtonColor
  label?: string
  attrs?: Record<string, unknown>
  class?: string
  type?: 'button' | 'submit' | 'reset'
  onCheckedChange?: (checked: boolean) => void
}
