import type { Component } from 'svelte'

export type DropdownItem = {
  label: string
  eyebrow?: string
  onSelect?: () => void
  icon?: Component | null
  class?: string
  iconClass?: string
  disabled?: boolean
}

export type DropdownProps = {
  ariaLabel: string
  triggerId?: string
  triggerLabel?: string
  onCloseAutoFocus?: (event: Event) => void
  disabled?: boolean
  triggerClass?: string
  triggerIcon?: Component | null
  triggerIconClass?: string
  /** Render an inline panel above the nearest positioned card body. */
  attached?: boolean
  contentClass?: string
  contentSide?: 'top' | 'right' | 'bottom' | 'left'
  contentSideOffset?: number
  contentAlign?: 'start' | 'center' | 'end'
  contentAlignOffset?: number
  itemClass?: string
  items?: DropdownItem[]
}
