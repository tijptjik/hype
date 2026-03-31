import type { Component } from 'svelte'

export type DropdownItem = {
  label: string
  onSelect?: () => void
  icon?: Component | null
  class?: string
  iconClass?: string
  disabled?: boolean
}

export type DropdownProps = {
  ariaLabel: string
  triggerClass?: string
  triggerIcon?: Component | null
  triggerIconClass?: string
  contentClass?: string
  contentSide?: 'top' | 'right' | 'bottom' | 'left'
  contentSideOffset?: number
  contentAlign?: 'start' | 'center' | 'end'
  itemClass?: string
  items?: DropdownItem[]
}
