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
  left?: Snippet
  center?: Snippet
  right?: Snippet
  class?: string
}
