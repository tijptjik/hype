import type { OrganisationRoleType } from '$lib/enums'
import type { OrganisationRoleUser, User } from '$lib/types'

export interface FormUserRolesSectionProps {
  title?: string
  subtitle?: string
  userRoles: OrganisationRoleUser[]
  isEditing?: boolean
  availableRoles?: Array<{ value: OrganisationRoleType; label: string }>
  onSearchUsers: (query: string) => Promise<User[]>
  onAddUser: (user: User) => void
  onRemoveUser: (userId: string) => void
  onRoleChange: (userId: string, role: OrganisationRoleType) => void
  class?: string
}

export interface FormUserRolesSectionActionsProps {
  isAdding: boolean
  isRemoving: boolean
  isEditing?: boolean
  onToggleAdding: () => void
  onToggleRemoving: () => void
}
