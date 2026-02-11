import type { Snippet } from 'svelte'

export type ButtonColor =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'

export type ButtonStyle = 'none' | 'outline' | 'dash' | 'soft' | 'ghost' | 'link'

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type ButtonModifier = 'wide' | 'block' | 'square' | 'circle'

export interface ButtonProps {
  text: string
  disabled?: boolean
  icon?: Snippet
  href?: string
  onClick?: (event: MouseEvent) => void
  color?: ButtonColor
  style?: ButtonStyle
  size?: ButtonSize
  modifier?: ButtonModifier
  class?: string
  type?: 'button' | 'submit' | 'reset'
}
