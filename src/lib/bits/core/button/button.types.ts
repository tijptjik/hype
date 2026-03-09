import type { Component, Snippet } from 'svelte'

export type ButtonColor =
  | 'neutral'
  | 'light'
  | 'dark'
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
  hideLabel?: boolean
  attrs?: Record<string, unknown>
  icon?: Snippet
  iconComponent?: Component | null
  href?: string
  onClick?: (event: MouseEvent) => void
  color?: ButtonColor
  style?: ButtonStyle
  size?: ButtonSize
  modifier?: ButtonModifier
  class?: string
  type?: 'button' | 'submit' | 'reset'
}
