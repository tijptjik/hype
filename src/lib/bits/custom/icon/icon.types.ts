import type { Component } from 'svelte'

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

export interface IconProps {
  src: Component<Record<string, unknown>>
  size?: IconSize
  tone?: IconTone
  filled?: boolean
  strokeWidth?: number | string
  title?: string
  class?: string
  style?: string
  [key: string]: unknown
}
