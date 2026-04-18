import type { HeaderSize } from '$lib/bits/custom/header/header.types'
import type { Snippet } from 'svelte'
import type {
  SectionHeaderAction,
  SectionHeaderFlag,
  SectionHeaderTrigger,
} from './src/sectionHeader/components/types'

export type { SectionHeaderAction, SectionHeaderFlag, SectionHeaderTrigger }

export interface SectionHeaderProps {
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
  children?: Snippet
  class?: string
}
