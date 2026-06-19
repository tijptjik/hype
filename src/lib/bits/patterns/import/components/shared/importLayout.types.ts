import type { Snippet } from 'svelte'

export type ImportHeaderStatTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

export type ImportHeaderStatItem = {
  label: string
  value: string | number
  tone?: ImportHeaderStatTone
}

export type ImportWorkspaceProps = {
  children?: Snippet
  class?: string
}

export type ImportRegionProps = {
  children?: Snippet
  class?: string
}

export type ImportRowProps = ImportRegionProps & {
  leading?: Snippet
  contentClass?: string
}

export type ImportRowColsProps = ImportRegionProps & {
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  contentClass?: string
}

export type ImportRowColProps = ImportRegionProps & {
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
}

export type ImportRowsProps = {
  children?: Snippet
  class?: string
  innerClass?: string
}

export type ImportHeaderProps = {
  children?: Snippet
  title: string
  subtitle?: string
  dataLabel?: string
  stats?: ImportHeaderStatItem[]
  statsAction?: Snippet
  progressValue?: number | null
  class?: string
}

export type ImportFooterProps = {
  onBack?: () => void
  onContinue?: () => void
  onSecondary?: () => void
  secondaryPlacement?: 'left' | 'right'
  backLabel?: string
  continueLabel?: string
  secondaryLabel?: string
  continueDisabled?: boolean
  secondaryDisabled?: boolean
  leftMetaText?: string
  rightMetaText?: string
  showPips?: boolean
  currentStep?: number
  totalSteps?: number
  class?: string
}
