// SVELTE
import type { Snippet } from 'svelte'

export interface AnalyticsCardProps {
  class?: string
  children?: Snippet
}

export interface AnalyticsCardRootProps {
  class?: string
  children?: Snippet
}

export interface AnalyticsCardHeaderProps {
  title: string
  leftLabel?: string
  rightLabel?: string
  right?: Snippet
  tooltip?: string
  class?: string
}

export interface AnalyticsCardSectionHeaderProps {
  title: string
  tooltip?: string
  class?: string
}

export interface AnalyticsCardWindowHeaderProps {
  leftLabel: string
  rightLabel: string
  class?: string
}

export interface AnalyticsCardEmptyStateProps {
  title: string
  description: string
  tone?: 'neutral' | 'warning' | 'error' | 'subtle'
  class?: string
}

export interface AnalyticsCardSkeletonBlockProps {
  class?: string
  pill?: boolean
}
