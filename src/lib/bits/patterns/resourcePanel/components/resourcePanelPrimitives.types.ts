import type { Snippet } from 'svelte'
import type { ResourcePanelRow, ResourcePanelSection } from '../resourcePanel.types'
export type ResourceLabelHandlers = {
  onLabelShow?: (name: string, anchor: HTMLElement) => void
  onLabelHide?: () => void
}
export type ResourceRowProps = ResourceLabelHandlers & {
  row: ResourcePanelRow
  tone: 'primary' | 'secondary' | 'tertiary'
  narrow?: boolean
  reorder?: {
    group: string
    ids: string[]
    onMove: (id: string, destination: number) => void
  }
}
export type ResourceSectionProps = ResourceLabelHandlers & {
  section: ResourcePanelSection
  /** Wait for sibling results so the first expansion uses the final shared allocation. */
  initialLayoutReady?: boolean
  narrow?: boolean
  admin?: boolean
  headerAction?: Snippet
}
