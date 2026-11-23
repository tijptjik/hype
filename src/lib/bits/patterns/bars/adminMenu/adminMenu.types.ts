// TYPES
import type { Component } from 'svelte'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

export interface AdminMenuItem {
  href: string
  label: string
  compactLabel?: string
  icon: Component<Record<string, unknown>>
  onClick?: ((event: MouseEvent) => void) | null
  notificationCount?: number
  notificationPending?: boolean
  tone?: 'primary' | 'secondary' | 'accent'
}

export type AdminMenuProps = Pick<PanelProps, 'isNarrow'>
