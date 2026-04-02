import type { Component } from 'svelte'
import type { ButtonColor } from '$lib/bits/core/button'

export type AppMenuTone = 'primary' | 'secondary'

export interface AppMenuItem<T = string> {
  value: T
  label: string
  icon: Component<Record<string, unknown>>
  color?: ButtonColor
  hideLabel?: boolean
  iconClasses?: string
  isMobileVisible?: boolean
  tone?: AppMenuTone
}

export interface AppMenuProps<T = string> {
  items: AppMenuItem<T>[]
  trailingItems?: AppMenuItem<T>[]
  onSelect?: (item: AppMenuItem<T>) => void
  offsetX?: number
  effectiveBottomOffset?: number
  class?: string
}
