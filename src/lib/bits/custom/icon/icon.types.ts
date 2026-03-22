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

export type IconTransition = (node: Element, params?: unknown) => TransitionConfig

export interface IconProps {
  src: Component<Record<string, unknown>>
  size?: IconSize
  tone?: IconTone
  animation?: IconAnimation
  transition?: IconTransition
  transitionParams?: Record<string, unknown>
  filled?: boolean
  strokeWidth?: number | string
  title?: string
  class?: string
  style?: string
  [key: string]: unknown
}
