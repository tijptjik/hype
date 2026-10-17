import type { Component } from 'svelte'
import type { OrganisationRoleType } from '#lib/enums.js'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types.js'
import type { User, UserSearchQueryOptions } from '#lib/db/zod/schema/user.types.js'

export type FormUserRole = Pick<OrganisationRoleUser, 'userId' | 'role' | 'user'>

export interface FormUserRolesSectionProps<Role extends string = OrganisationRoleType> {
  icon?: Component
  title?: string
  subtitle?: string
  layout?: 'grid' | 'list'
  minCardWidth?: number
  transitionEntityKey?: string | number | null
  currentUserId: string | null | undefined
  removeSelfResourceLabel?: string
  issues?: string[]
  userRoles: FormUserRole[]
  hiddenUserIdInputAttrs?: Array<Record<string, unknown>>
  roleFieldNameByUserId?: Record<string, string>
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  availableRoles?: Array<{ value: Role; label: string }>
  userQueryParams?: UserSearchQueryOptions
  onAddUser: (user: User) => void
  onRemoveUser: (userId: string) => void
  onRoleChange: (userId: string, role: Role) => void
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
