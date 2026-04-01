import type { Component } from 'svelte'

export type AppMenuTone = 'primary' | 'secondary'

export interface AppMenuItem<T = string> {
  value: T
  label: string
  icon: Component<Record<string, unknown>>
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
