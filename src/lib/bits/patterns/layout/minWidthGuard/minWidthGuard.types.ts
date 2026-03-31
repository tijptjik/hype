import type { Component, Snippet } from 'svelte'

export interface MinWidthGuardProps {
  children: Snippet
  minWidth: number
  title: string
  description: string
  widthLabel: string
  progressMax?: number
  icon?: Component<Record<string, unknown>> | null
}
