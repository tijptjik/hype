import type { OrganisationRoleType } from '$lib/enums'
import type { OrganisationRoleUser, User, UserSearchQueryOptions } from '$lib/types'

export interface FormUserRolesSectionProps {
  title?: string
  subtitle?: string
  userRoles: OrganisationRoleUser[]
  hiddenUserIdInputAttrs?: Array<Record<string, unknown>>
  roleFieldNameByUserId?: Record<string, string>
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  availableRoles?: Array<{ value: OrganisationRoleType; label: string }>
  userQueryParams?: UserSearchQueryOptions
  onAddUser: (user: User) => void
  onRemoveUser: (userId: string) => void
  onRoleChange: (userId: string, role: OrganisationRoleType) => void
  class?: string
}

export interface FormUserRolesSectionActionsProps {
  isAdding: boolean
  isRemoving: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  onToggleAdding: () => void
  onToggleRemoving: () => void
}
