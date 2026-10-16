import type { Snippet } from 'svelte'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

export type ResourcePanelRow = {
  id: string
  name: string
  /** Compact localized label for selected tags; rows keep their full name. */
  shortName?: string
  breadcrumbs: string[]
  selected: boolean
  active: boolean
  enabled: boolean
  primaryLabel: string
  toggleLabel: string
  onPrimary: () => void | Promise<void>
  onToggle: () => void | Promise<void>
  onIsolate?: () => void | Promise<void>
}
export type ResourcePanelSection = {
  id: 'organisation' | 'project' | 'layer'
  title: string
  search: string
  rows: ResourcePanelRow[]
  loading: boolean
  error: boolean
  viewKey: string
  defaultOpen: boolean
  onSearch: (value: string) => void
  onReset: () => void
  onNext: () => void | Promise<void>
  onRetry: () => void
  onVisible: (rows: ResourcePanelRow[]) => void
  /** Whether the current route is this section's resource index. */
  isIndexActive?: boolean
  onNavigate?: () => void | Promise<void>
}
export type ResourcePanelModel = {
  panel: PanelProps
  open: boolean
  title: string
  sections: ResourcePanelSection[]
  onClose: () => void
  loadingMessage?: string
  loadError?: boolean
  onRetryFeatures?: () => void
}
export type ResourcePanelProps = { model: ResourcePanelModel; footer?: Snippet }
