import type { ResourcePanelRow, ResourcePanelSection } from '../resourcePanel.types'
export type ResourceRowProps = {
  row: ResourcePanelRow
  tone: 'primary' | 'secondary' | 'tertiary'
  narrow?: boolean
}
export type ResourceSectionProps = {
  section: ResourcePanelSection
  narrow?: boolean
  admin?: boolean
}
