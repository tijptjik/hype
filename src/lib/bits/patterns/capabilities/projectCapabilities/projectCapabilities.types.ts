import type { CapabilityKey } from '#lib/capabilities.types.js'
import type { UserCapabilityMatrixRow } from '#lib/bits/patterns/capabilities/userCapabilityMatrix/index.js'

export interface ProjectCapabilitiesProps {
  title?: string
  subtitle?: string
  capabilityIssues?: string[]
  class?: string
  availableCapabilityKeys: CapabilityKey[]
  enabledCapabilityKeys: CapabilityKey[]
  capabilityLabelByKey: Partial<Record<CapabilityKey, string>>
  matrixTitle?: string
  matrixSubtitle?: string
  matrixRows: UserCapabilityMatrixRow[]
  isEditing?: boolean
  onToggleCapability: (capabilityKey: CapabilityKey, value: boolean) => void
  onToggleCell: (params: {
    userId: string
    capabilityKey: CapabilityKey
    value: boolean
  }) => void
}
