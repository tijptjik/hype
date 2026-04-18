import type { Component } from 'svelte'
import type { TransitionConfig } from 'svelte/transition'

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

export type IconTone =
  | 'inherit'
  | 'current'
  | 'base'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'white'

export type IconAnimation = 'inherit' | 'spin'

export type IconTransitionFn = (node: Element, params?: any) => TransitionConfig
export type IconTransition = 'none' | 'fade' | IconTransitionFn

export interface IconProps {
  src: Component<Record<string, unknown>>
  size?: IconSize
  tone?: IconTone
  animation?: IconAnimation
  transition?: IconTransition
  transitionOpts?: any
  filled?: boolean
  strokeWidth?: number | string
  title?: string
  class?: string
  style?: string
  [key: string]: unknown
}
