// TYPES
import type { Component } from 'svelte'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

export interface AdminMenuItem {
  href: string
  label: string
  icon: Component<Record<string, unknown>>
  onClick?: ((event: MouseEvent) => void) | null
  notificationCount?: number
  tone?: 'primary' | 'secondary' | 'accent'
}

export interface AdminMenuProps extends Pick<PanelProps, 'isNarrow'> {
  /** First row in the sidebar's current filtered and ordered Layers list. */
  firstLayerId?: string
}
