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

export type ImportRowsProps = {
  children?: Snippet
  class?: string
  innerClass?: string
}

export type ImportHeaderProps = {
  title: string
  subtitle?: string
  dataLabel?: string
  stats?: ImportHeaderStatItem[]
  progressValue?: number | null
  class?: string
}

export type ImportFooterProps = {
  onBack?: () => void
  onContinue?: () => void
  onSecondary?: () => void
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
