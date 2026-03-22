import type { Component, Snippet } from 'svelte'
import type { TransitionConfig } from 'svelte/transition'

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

export type ButtonStyle =
  | 'none'
  | 'outline'
  | 'dash'
  | 'soft'
  | 'ghost'
  | 'transparent'
  | 'link'

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type ButtonModifier = 'wide' | 'block' | 'square' | 'circle'
export type ButtonTransitionFn = (node: Element, params?: unknown) => TransitionConfig
export type ButtonTransition = 'none' | 'fade' | ButtonTransitionFn
export type ButtonCssVars = Partial<Record<`--btn-${string}`, string>>

export interface ButtonProps {
  text: string
  disabled?: boolean
  hideLabel?: boolean
  hideLabelInstantly?: boolean
  availableWidth?: number
  hideLabelBelow?: number
  attrs?: Record<string, unknown>
  icon?: Snippet
  iconComponent?: Component | null
  href?: string
  onClick?: (event: MouseEvent) => void
  color?: ButtonColor
  style?: ButtonStyle
  size?: ButtonSize
  modifier?: ButtonModifier
  transition?: ButtonTransition
  transitionOpts?: unknown
  iconClasses?: string
  labelClasses?: string
  class?: string
  type?: 'button' | 'submit' | 'reset'
}
