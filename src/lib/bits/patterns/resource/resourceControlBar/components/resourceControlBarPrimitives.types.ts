import type { Component, Snippet } from 'svelte'

export type ResourceControlBarRootProps = {
  filterLabel: string
  filterIcon?: Component
  hasActiveSection?: boolean
  showSort?: boolean
  count: number
  resetDisabled?: boolean
  onReset?: (event: MouseEvent) => void
  filterMenuContent?: Snippet<
    [
      {
        notifyLayoutChange: () => void
        closeMenu: () => void
      },
    ]
  >
  filterActiveContent?: Snippet<[{ notifyLayoutChange: () => void }]>
  sortContent?: Snippet<
    [
      {
        isSortOpen: boolean
        handleSortOpenChange: (isOpen: boolean) => Promise<void>
      },
    ]
  >
  children?: Snippet
  class?: string
}

export type ResourceControlBarFilterCtrlProps = {
  label: string
  icon?: Component
  onHover?: () => void
  onClick?: (event: MouseEvent) => void
  showMenu?: boolean
  isCollapsed?: boolean
  rootElement?: HTMLDivElement | undefined
  menuElement?: HTMLDivElement | undefined
  activeElement?: HTMLDivElement | undefined
  menuContent?: Snippet
  activeContent?: Snippet
  class?: string
}

export type ResourceControlBarSortCtrlProps = {
  rootElement?: HTMLDivElement | undefined
  children?: Snippet
  class?: string
}

export type ResourceControlBarResultCountProps = {
  count: number
  class?: string
}

export type ResourceControlBarFilterResetProps = {
  disabled?: boolean
  onClick?: (event: MouseEvent) => void
  class?: string
}

export type ResourceControlBarTriStateToggleProps = {
  label: string
  tooltip?: string
  currentValue: boolean | null
  falseLabel?: string
  trueLabel?: string
  idx?: number
  transformOffset?: number
  onCheckedChange?: (nextChecked: boolean | null) => void
  class?: string
}

export type ResourceControlBarToggleProps = {
  label: string
  tooltip?: string
  currentValue: boolean | null
  onToggleFalse: () => void
  onToggleTrue: () => void
  onToggleChange: (event: Event) => void
  idx?: number
  falseLabel?: string
  trueLabel?: string
  transformOffset?: number
  class?: string
}

export type ResourceControlBarLocaleToggleItem = {
  value: string
  label: string
  selected: boolean
  onToggle?: (event: MouseEvent) => void
}

export type ResourceControlBarLocaleToggleGroupProps = {
  items: ResourceControlBarLocaleToggleItem[]
  class?: string
}
