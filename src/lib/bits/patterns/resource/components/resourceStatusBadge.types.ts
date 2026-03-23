import type { Component } from 'svelte'
import type { Task } from '$lib/types'

export type ResourceStatusBadgeTone = 'neutral' | 'warning' | 'success' | 'error'

export type ResourceStatusBadgeProps = {
  label: string
  tone?: ResourceStatusBadgeTone
  tooltipText?: string | null
  icon?: Component<Record<string, unknown>> | null
  class?: string
}

export type ResourceFeatureStatusBadgeProps = {
  isPublished: boolean
  isPendingReview: boolean
}

export type ResourceTaskStatusBadgeProps = {
  entity: Task
}
