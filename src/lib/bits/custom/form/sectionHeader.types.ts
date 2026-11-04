import type { HeaderSize } from '#lib/bits/custom/header/header.types.js'
import type { Component, Snippet } from 'svelte'
import type {
  SectionHeaderAction,
  SectionHeaderFlag,
  SectionHeaderTrigger,
} from './src/sectionHeader/components/types'

export type { SectionHeaderAction, SectionHeaderFlag, SectionHeaderTrigger }

export interface SectionHeaderProps {
  showControlLabels?: boolean
  icon?: Component
  title?: string
  description?: string
  size?: HeaderSize
  flags?: SectionHeaderFlag[]
  actions?: SectionHeaderAction[]
  triggers?: SectionHeaderTrigger[]
  onCollapsableToggle?: (nextCollapsed: boolean, event: MouseEvent) => void
  isCollapsableCollapsed?: boolean
  collapsableExpandLabel?: string
  collapsableCollapseLabel?: string
  onVisibilityToggle?: (nextVisible: boolean, event: MouseEvent) => void
  isVisibilityOn?: boolean
  visibilityOnLabel?: string
  visibilityOffLabel?: string
  left?: Snippet
  center?: Snippet
  right?: Snippet
  /** Additional actions after the visibility and collapse controls. */
  afterControls?: Snippet
  children?: Snippet
  class?: string
}
