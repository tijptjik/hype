import type { CapabilityKey } from '$lib/types'
import type { ProjectRoleCapabilities } from '$lib/db/zod/schema/project.types'

export type UserCapabilityMatrixRow = {
  userId: string
  name: string
  role: string
  capabilities?: ProjectRoleCapabilities
}

export interface UserCapabilityMatrixProps {
  title?: string
  subtitle?: string
  capabilityKeys: CapabilityKey[]
  capabilityLabelByKey: Partial<Record<CapabilityKey, string>>
  rows: UserCapabilityMatrixRow[]
  isEditing?: boolean
  onToggleCell: (params: {
    userId: string
    capabilityKey: CapabilityKey
    value: boolean
  }) => void
}
